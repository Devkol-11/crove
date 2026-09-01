import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { customAlphabet } from 'nanoid'
import {
  EscrowStatus,
  EscrowRole,
  EscrowType,
  LedgerEntryType,
  TransactionType,
} from './escrow.types'
import type { CreateEscrowInput } from './escrow.schema'
import { EscrowAggregate } from './domain/entity/escrow.aggregate'
import { EscrowDisputeEntity } from './domain/entity/escrow-dispute.entity'
import { appendEscrowEvent } from './domain/helpers/escrow-event.helper'
import { createTransaction } from './domain/helpers/transaction.helper'
import { appendLedgerEntry, getLedgerBalance } from './domain/helpers/ledger.helper'
import { eventDispatcher } from '../../lib/event-dispatcher'
import { withDbErrorHandler } from '../../lib/db.error.handler'
import { mapDomainError } from '../../lib/domain.error.mapper'

const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6)

export class EscrowService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  // ── create ────────────────────────────────────────────────────────────────

  async create(creatorId: string, input: CreateEscrowInput) {
    try {
      EscrowAggregate.assertValidCreationInput(input)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    const code = generateCode()
    const amount =
      input.type === EscrowType.Milestone
        ? input.milestones.reduce((sum, m) => sum + m.amount, 0)
        : input.amount

    const escrowData = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const created = await tx.escrow.create({
            data: {
              code,
              title: input.title,
              description: input.description,
              type: input.type,
              status: EscrowStatus.Created,
              amount,
              currency: input.currency,
              releaseCondition:
                input.type === EscrowType.Conditional ? input.releaseCondition : null,
              creatorId,
              participants: {
                create: { userId: creatorId, role: EscrowRole.Creator },
              },
              ...(input.type === EscrowType.Milestone && {
                milestones: {
                  create: input.milestones.map((m, i) => ({
                    title: m.title,
                    description: m.description,
                    amount: m.amount,
                    deadline: m.deadline ? new Date(m.deadline) : null,
                    order: i + 1,
                  })),
                },
              }),
            },
            include: { milestones: true, participants: true },
          })

          await appendEscrowEvent(tx, created.id, 'EscrowCreated', creatorId)

          return created
        }),
      this.app,
    )

    const escrow = EscrowAggregate.from(escrowData)
    escrow.raiseCreatedEvent(creatorId)
    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    return escrowData
  }

  // ── transition ────────────────────────────────────────────────────────────

  async transition(escrowId: string, actorId: string, toStatus: EscrowStatus) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    try {
      escrow.assertCanTransitionTo(toStatus)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    switch (toStatus) {
      case EscrowStatus.Funded:
        escrow.fund(actorId)
        break
      case EscrowStatus.Released:
        escrow.release(actorId)
        break
    }

    const updated = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.escrow.update({
            where: { id: escrowId },
            data: {
              status: toStatus,
              fundedAt: toStatus === EscrowStatus.Funded ? new Date() : undefined,
              releasedAt: toStatus === EscrowStatus.Released ? new Date() : undefined,
            },
          })

          await appendEscrowEvent(tx, escrowId, `StatusChangedTo${toStatus}`, actorId)

          if (toStatus === EscrowStatus.Funded) {
            await appendLedgerEntry(tx, {
              escrowId,
              userId: actorId,
              type: LedgerEntryType.Funding,
              amount: escrow.amount,
              currency: escrow.currency,
              description: `Escrow ${escrow.code} funded`,
            })
            await createTransaction(tx, {
              escrowId,
              type: TransactionType.Funding,
              amount: escrow.amount,
              currency: escrow.currency,
            })
          }

          if (toStatus === EscrowStatus.Released) {
            await appendLedgerEntry(tx, {
              escrowId,
              type: LedgerEntryType.Release,
              amount: escrow.amount,
              currency: escrow.currency,
              description: `Escrow ${escrow.code} funds released to seller`,
            })
          }

          if (toStatus === EscrowStatus.Refunded) {
            await appendLedgerEntry(tx, {
              escrowId,
              userId: actorId,
              type: LedgerEntryType.Refund,
              amount: escrow.amount,
              currency: escrow.currency,
              description: `Escrow ${escrow.code} refunded to buyer`,
            })
          }

          return result
        }),
      this.app,
    )

    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    return updated
  }

  // ── openDispute ───────────────────────────────────────────────────────────

  async openDispute(escrowId: string, raisedById: string, reason: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(raisedById)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    try {
      escrow.assertCanTransitionTo(EscrowStatus.Disputed)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    return withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const dispute = await tx.escrowDispute.create({
            data: { escrowId, raisedById, reason },
          })

          await tx.escrow.update({
            where: { id: escrowId },
            data: { status: EscrowStatus.Disputed },
          })

          await appendEscrowEvent(tx, escrowId, 'DisputeOpened', raisedById, { reason })

          return dispute
        }),
      this.app,
    )
  }

  // ── resolveDispute ────────────────────────────────────────────────────────

  async resolveDispute(disputeId: string, resolution: string, resolvedById: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrowDispute.findUnique({ where: { id: disputeId } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Dispute not found')

    const dispute = EscrowDisputeEntity.from(data)

    try {
      dispute.assertCanResolve()
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    return withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.escrowDispute.update({
            where: { id: disputeId },
            data: { status: 'Resolved', resolution, resolvedAt: new Date() },
          })

          await appendEscrowEvent(tx, dispute.escrowId, 'DisputeResolved', resolvedById, {
            resolution,
          })

          return result
        }),
      this.app,
    )
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getByCode(code: string) {
    const escrow = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where: { code },
          include: {
            creator: { select: { id: true, firstName: true, lastName: true, email: true } },
            participants: {
              include: { user: { select: { id: true, firstName: true, lastName: true } } },
            },
            milestones: { orderBy: { order: 'asc' } },
            events: { orderBy: { createdAt: 'desc' }, take: 20 },
            disputes: true,
            ledgerEntries: { orderBy: { createdAt: 'asc' } },
          },
        }),
      this.app,
    )
    if (!escrow) throw this.app.httpErrors.notFound('Escrow not found')
    return escrow
  }

  async listByUser(userId: string) {
    return withDbErrorHandler(
      () =>
        this.db.escrow.findMany({
          where: {
            OR: [{ creatorId: userId }, { participants: { some: { userId } } }],
          },
          include: { milestones: { orderBy: { order: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        }),
      this.app,
    )
  }

  async getLedgerBalance(escrowId: string) {
    const escrow = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId } }),
      this.app,
    )
    if (!escrow) throw this.app.httpErrors.notFound('Escrow not found')

    return withDbErrorHandler(() => getLedgerBalance(this.db, escrowId), this.app)
  }
}
