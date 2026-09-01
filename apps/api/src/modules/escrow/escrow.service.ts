import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { customAlphabet } from 'nanoid'
import { EscrowStatus, EscrowRole, EscrowType, LedgerEntryType, TransactionType } from './escrow.types'
import type { CreateEscrowInput } from './escrow.schema'
import { EscrowAggregate } from './domain/entity/escrow.aggregate'
import { EscrowDisputeEntity } from './domain/entity/escrow-dispute.entity'
import { appendEscrowEvent } from './domain/helpers/escrow-event.helper'
import { createTransaction } from './domain/helpers/transaction.helper'
import { appendLedgerEntry, getLedgerBalance } from './domain/helpers/ledger.helper'
import { eventDispatcher } from '../../lib/event-dispatcher'

const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6)

export class EscrowService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  // ── create ────────────────────────────────────────────────────────────────

  async create(creatorId: string, input: CreateEscrowInput) {
    // ── 1. Aggregate validates domain invariants ──────────────────────────
    //
    // This runs BEFORE any DB write. Zod already checked shape (positive numbers,
    // non-empty strings). The aggregate checks meaning: supported currency,
    // milestone deadlines in the future, etc.
    // If this throws, the controller returns a 400 immediately — nothing was written.
    try {
      EscrowAggregate.assertValidCreationInput(input)
    } catch (err) {
      throw this.app.httpErrors.badRequest((err as Error).message)
    }

    const code = generateCode()

    const amount =
      input.type === EscrowType.Milestone
        ? input.milestones.reduce((sum, m) => sum + m.amount, 0)
        : input.amount

    // ── 2. Persist via Prisma ────────────────────────────────────────────
    const escrowData = await this.db.escrow.create({
      data: {
        code,
        title:       input.title,
        description: input.description,
        type:        input.type,
        status:      EscrowStatus.Created,
        amount,
        currency:    input.currency,
        releaseCondition:
          input.type === EscrowType.Conditional ? input.releaseCondition : null,
        creatorId,
        participants: {
          create: { userId: creatorId, role: EscrowRole.Creator },
        },
        ...(input.type === EscrowType.Milestone && {
          milestones: {
            create: input.milestones.map((m, i) => ({
              title:       m.title,
              description: m.description,
              amount:      m.amount,
              deadline:    m.deadline ? new Date(m.deadline) : null,
              order:       i + 1,
            })),
          },
        }),
      },
      include: { milestones: true, participants: true },
    })

    // ── 3. Append audit event ─────────────────────────────────────────────
    //
    // Separate query — audit events are non-critical. If this fails,
    // the escrow row still exists in a valid state.
    await appendEscrowEvent(this.db, escrowData.id, 'EscrowCreated', creatorId)

    // ── 4. Wrap in aggregate, raise and dispatch domain event ────────────
    const escrow = EscrowAggregate.from(escrowData)
    escrow.raiseCreatedEvent(creatorId)
    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    return escrowData
  }

  // ── transition ────────────────────────────────────────────────────────────

  async transition(escrowId: string, actorId: string, toStatus: EscrowStatus) {
    // ── 1. Load from DB ──────────────────────────────────────────────────
    const data = await this.db.escrow.findUnique({
      where:   { id: escrowId },
      include: { participants: true },
    })
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    // ── 2. Wrap in aggregate ─────────────────────────────────────────────
    const escrow = EscrowAggregate.from(data)

    // ── 3. Validate the state transition ─────────────────────────────────
    try {
      escrow.assertCanTransitionTo(toStatus)
    } catch (err) {
      throw this.app.httpErrors.badRequest((err as Error).message)
    }

    // ── 4. Authorisation check ───────────────────────────────────────────
    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    // ── 5. Execute the business command ──────────────────────────────────
    //
    // The command method queues a domain event internally. No DB write yet.
    switch (toStatus) {
      case EscrowStatus.Funded:
        escrow.fund(actorId)
        break
      case EscrowStatus.Released:
        escrow.release(actorId)
        break
    }

    // ── 6. Persist atomically: status + audit event + ledger entry ────────
    //
    // $transaction ensures all three writes commit together or not at all.
    // In a financial app the ledger entry MUST exist if the status changed —
    // they cannot be out of sync.
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.escrow.update({
        where: { id: escrowId },
        data: {
          status:     toStatus,
          fundedAt:   toStatus === EscrowStatus.Funded   ? new Date() : undefined,
          releasedAt: toStatus === EscrowStatus.Released ? new Date() : undefined,
        },
      })

      await appendEscrowEvent(tx, escrowId, `StatusChangedTo${toStatus}`, actorId)

      if (toStatus === EscrowStatus.Funded) {
        await appendLedgerEntry(tx, {
          escrowId,
          userId:      actorId,
          type:        LedgerEntryType.Funding,
          amount:      escrow.amount,
          currency:    escrow.currency,
          description: `Escrow ${escrow.code} funded`,
        })
        await createTransaction(tx, {
          escrowId,
          type:     TransactionType.Funding,
          amount:   escrow.amount,
          currency: escrow.currency,
        })
      }

      if (toStatus === EscrowStatus.Released) {
        await appendLedgerEntry(tx, {
          escrowId,
          type:        LedgerEntryType.Release,
          amount:      escrow.amount,
          currency:    escrow.currency,
          description: `Escrow ${escrow.code} funds released to seller`,
        })
      }

      if (toStatus === EscrowStatus.Refunded) {
        await appendLedgerEntry(tx, {
          escrowId,
          userId:      actorId,
          type:        LedgerEntryType.Refund,
          amount:      escrow.amount,
          currency:    escrow.currency,
          description: `Escrow ${escrow.code} refunded to buyer`,
        })
      }

      return result
    })

    // ── 7. Dispatch domain events ─────────────────────────────────────────
    //
    // Only after the transaction committed. If $transaction threw, we never
    // reach here — no false events fire.
    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    return updated
  }

  // ── openDispute ───────────────────────────────────────────────────────────

  async openDispute(escrowId: string, raisedById: string, reason: string) {
    const data = await this.db.escrow.findUnique({
      where:   { id: escrowId },
      include: { participants: true },
    })
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(raisedById)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    try {
      escrow.assertCanTransitionTo(EscrowStatus.Disputed)
    } catch (err) {
      throw this.app.httpErrors.badRequest((err as Error).message)
    }

    const disputeData = await this.db.$transaction(async (tx) => {
      const dispute = await tx.escrowDispute.create({
        data: { escrowId, raisedById, reason },
      })

      await tx.escrow.update({
        where: { id: escrowId },
        data:  { status: EscrowStatus.Disputed },
      })

      await appendEscrowEvent(tx, escrowId, 'DisputeOpened', raisedById, { reason })

      return dispute
    })

    return EscrowDisputeEntity.from(disputeData)
  }

  // ── resolveDispute ────────────────────────────────────────────────────────

  async resolveDispute(disputeId: string, resolution: string, resolvedById: string) {
    const data = await this.db.escrowDispute.findUnique({ where: { id: disputeId } })
    if (!data) throw this.app.httpErrors.notFound('Dispute not found')

    const dispute = EscrowDisputeEntity.from(data)

    try {
      dispute.assertCanResolve()
    } catch (err) {
      throw this.app.httpErrors.badRequest((err as Error).message)
    }

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.escrowDispute.update({
        where: { id: disputeId },
        data:  { status: 'Resolved', resolution, resolvedAt: new Date() },
      })

      await appendEscrowEvent(tx, dispute.escrowId, 'DisputeResolved', resolvedById, { resolution })

      return result
    })

    return EscrowDisputeEntity.from(updated)
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getByCode(code: string) {
    const escrow = await this.db.escrow.findUnique({
      where:   { code },
      include: {
        creator:      { select: { id: true, firstName: true, lastName: true, email: true } },
        participants: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        milestones:   { orderBy: { order: 'asc' } },
        events:       { orderBy: { createdAt: 'desc' }, take: 20 },
        disputes:     true,
        ledgerEntries: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!escrow) throw this.app.httpErrors.notFound('Escrow not found')
    return escrow
  }

  async listByUser(userId: string) {
    return this.db.escrow.findMany({
      where: {
        OR: [
          { creatorId: userId },
          { participants: { some: { userId } } },
        ],
      },
      include: { milestones: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getLedgerBalance(escrowId: string) {
    const escrow = await this.db.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw this.app.httpErrors.notFound('Escrow not found')
    return getLedgerBalance(this.db, escrowId)
  }
}
