import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  EscrowStatus,
  EscrowRole,
  EscrowType,
  LedgerEntryType,
  TransactionType,
} from './escrow.types'
import type {
  CreateEscrowInput,
  CreateQuickEscrowInput,
  JoinRequestInput,
  JoinVerifyInput,
} from './escrow.schema'
import { EscrowAggregate } from './domain/entity/escrow.aggregate'
import { EscrowDisputeEntity } from './domain/entity/escrow-dispute.entity'
import { MilestoneEntity } from './domain/entity/milestone.entity'
import {
  createStandardEscrow,
  createMilestoneEscrow,
  createConditionalEscrow,
  createDepositEscrow,
  createQuickLinkEscrow,
} from './domain/escrow-creators'
import { createJoinOtp, verifyJoinOtp } from './domain/helpers/otp.helper'
import { appendEscrowEvent } from './domain/helpers/escrow-event.helper'
import { createTransaction } from './domain/helpers/transaction.helper'
import { appendLedgerEntry, getLedgerBalance } from './domain/helpers/ledger.helper'
import { eventDispatcher } from '../../lib/event-dispatcher'
import { withDbErrorHandler } from '../../lib/db.error.handler'
import { mapDomainError } from '../../lib/domain.error.mapper'
import { getQueues } from '../../queues'
import { ESCROW_JOBS } from '../../queues/workers/escrow.worker'

export class EscrowService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  // ── Create (authenticated — 4 types) ─────────────────────────────────────

  async create(creatorId: string, input: CreateEscrowInput) {
    try {
      EscrowAggregate.assertValidCreationInput(input)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    const result = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          switch (input.type) {
            case EscrowType.Standard:    return createStandardEscrow(tx, creatorId, input)
            case EscrowType.Milestone:   return createMilestoneEscrow(tx, creatorId, input)
            case EscrowType.Conditional: return createConditionalEscrow(tx, creatorId, input)
            case EscrowType.Deposit:     return createDepositEscrow(tx, creatorId, input)
          }
        }),
      this.app,
    )

    const escrow = EscrowAggregate.from(result.escrow)
    escrow.raiseCreatedEvent(creatorId)
    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    await this.scheduleExpiryJob(result.escrow.id, result.escrow.expiresAt)

    return result
  }

  // ── Create Quick Link (no auth) ───────────────────────────────────────────

  async createQuick(input: CreateQuickEscrowInput) {
    const result = await withDbErrorHandler(
      () => this.db.$transaction((tx) => createQuickLinkEscrow(tx, input)),
      this.app,
    )

    await this.scheduleExpiryJob(result.escrow.id, result.escrow.expiresAt)

    return result
  }

  // ── Quick link join — OTP flow ────────────────────────────────────────────

  async requestJoinOtp(code: string, input: JoinRequestInput) {
    const escrow = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where:   { code },
          include: { participants: true },
        }),
      this.app,
    )
    if (!escrow) throw this.app.httpErrors.notFound('Escrow not found')
    if (!escrow.isQuickLink) throw this.app.httpErrors.badRequest('This escrow is not a quick link')

    if (escrow.expiresAt && escrow.expiresAt < new Date()) {
      throw this.app.httpErrors.gone('This escrow link has expired')
    }

    const existingRoles = escrow.participants.map((p) => p.role as EscrowRole)
    if (existingRoles.includes(EscrowRole.Payer) && existingRoles.includes(EscrowRole.Payee)) {
      throw this.app.httpErrors.conflict('Both participants have already joined this escrow')
    }

    const alreadyJoined = escrow.participants.some((p) => p.email === input.email)
    if (alreadyJoined) throw this.app.httpErrors.conflict('You have already joined this escrow')

    await createJoinOtp(this.db, escrow.id, input.name, input.email)

    return { message: 'OTP sent to your email. It expires in 10 minutes.' }
  }

  async verifyJoinAndJoin(code: string, input: JoinVerifyInput) {
    const escrow = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where:   { code },
          include: { participants: true },
        }),
      this.app,
    )
    if (!escrow) throw this.app.httpErrors.notFound('Escrow not found')

    const otp = await verifyJoinOtp(this.db, escrow.id, input.email, input.otp)
    if (!otp) throw this.app.httpErrors.badRequest('Invalid or expired OTP')

    const existingRoles = escrow.participants.map((p) => p.role as EscrowRole)
    const recipientRole = existingRoles.includes(EscrowRole.Payer)
      ? EscrowRole.Payee
      : EscrowRole.Payer

    const participant = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const created = await tx.escrowParticipant.create({
            data: {
              escrowId: escrow.id,
              userId:   null,
              name:     otp.name,
              email:    otp.email,
              role:     recipientRole,
            },
          })
          await appendEscrowEvent(tx, escrow.id, 'ParticipantJoined', otp.email, {
            role: recipientRole,
          })
          return created
        }),
      this.app,
    )

    return {
      participant,
      escrow: {
        code:     escrow.code,
        title:    escrow.title,
        amount:   escrow.amount,
        currency: escrow.currency,
        status:   escrow.status,
      },
    }
  }

  // ── Fund ──────────────────────────────────────────────────────────────────

  async fundEscrow(escrowId: string, actorId: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (!escrow.canUserFund(actorId)) {
      throw this.app.httpErrors.forbidden('Only the Payer can fund an escrow')
    }

    try {
      escrow.fund(actorId)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    const updated = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.escrow.update({
            where: { id: escrowId },
            data:  { status: EscrowStatus.Funded, fundedAt: new Date() },
          })
          await appendEscrowEvent(tx, escrowId, 'StatusChangedToFunded', actorId)
          await appendLedgerEntry(tx, {
            escrowId,
            userId:      actorId,
            type:        LedgerEntryType.Funding,
            amount:      escrow.amount,
            currency:    escrow.currency,
            description: `Escrow ${escrow.code} funded by payer`,
          })
          await createTransaction(tx, {
            escrowId,
            type:     TransactionType.Funding,
            amount:   escrow.amount,
            currency: escrow.currency,
          })
          return result
        }),
      this.app,
    )

    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    return updated
  }

  // ── Release ───────────────────────────────────────────────────────────────

  async releaseEscrow(escrowId: string, actorId: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (!escrow.canUserApprove(actorId)) {
      throw this.app.httpErrors.forbidden('Only the Payer can release funds')
    }

    try {
      escrow.release(actorId)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    const updated = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.escrow.update({
            where: { id: escrowId },
            data:  { status: EscrowStatus.Released, releasedAt: new Date() },
          })
          await appendEscrowEvent(tx, escrowId, 'StatusChangedToReleased', actorId)
          await appendLedgerEntry(tx, {
            escrowId,
            type:        LedgerEntryType.Release,
            amount:      escrow.amount,
            currency:    escrow.currency,
            description: `Escrow ${escrow.code} funds released to payee`,
          })
          return result
        }),
      this.app,
    )

    await eventDispatcher.dispatchMany(escrow.domainEvents)
    escrow.clearDomainEvents()

    return updated
  }

  // ── Refund ────────────────────────────────────────────────────────────────

  async refundEscrow(escrowId: string, actorId: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    try {
      escrow.assertCanTransitionTo(EscrowStatus.Refunded)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    return withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.escrow.update({
            where: { id: escrowId },
            data:  { status: EscrowStatus.Refunded },
          })
          await appendEscrowEvent(tx, escrowId, 'StatusChangedToRefunded', actorId)
          await appendLedgerEntry(tx, {
            escrowId,
            userId:      actorId,
            type:        LedgerEntryType.Refund,
            amount:      escrow.amount,
            currency:    escrow.currency,
            description: `Escrow ${escrow.code} refunded to payer`,
          })
          return result
        }),
      this.app,
    )
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  async cancelEscrow(escrowId: string, actorId: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    try {
      escrow.assertCanTransitionTo(EscrowStatus.Cancelled)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    return withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.escrow.update({
            where: { id: escrowId },
            data:  { status: EscrowStatus.Cancelled },
          })
          await appendEscrowEvent(tx, escrowId, 'StatusChangedToCancelled', actorId)
          return result
        }),
      this.app,
    )
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

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
            data:  { status: EscrowStatus.Disputed },
          })
          await appendEscrowEvent(tx, escrowId, 'DisputeOpened', raisedById, { reason })
          return dispute
        }),
      this.app,
    )
  }

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
            data:  { status: 'Resolved', resolution, resolvedAt: new Date() },
          })
          await appendEscrowEvent(tx, dispute.escrowId, 'DisputeResolved', resolvedById, {
            resolution,
          })
          return result
        }),
      this.app,
    )
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  async submitMilestone(escrowId: string, milestoneId: string, actorId: string) {
    const [escrowData, milestoneData] = await Promise.all([
      withDbErrorHandler(
        () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
        this.app,
      ),
      withDbErrorHandler(
        () => this.db.milestone.findUnique({ where: { id: milestoneId } }),
        this.app,
      ),
    ])

    if (!escrowData) throw this.app.httpErrors.notFound('Escrow not found')
    if (!milestoneData || milestoneData.escrowId !== escrowId) {
      throw this.app.httpErrors.notFound('Milestone not found')
    }

    const escrow    = EscrowAggregate.from(escrowData)
    const milestone = MilestoneEntity.from(milestoneData)

    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (escrow.getRoleForUser(actorId) !== EscrowRole.Payee) {
      throw this.app.httpErrors.forbidden('Only the Payee can submit milestones')
    }
    if (!milestone.canBeSubmitted()) {
      throw this.app.httpErrors.badRequest(
        `Milestone cannot be submitted from '${milestone.status}' state`,
      )
    }

    return withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const updated = await tx.milestone.update({
            where: { id: milestoneId },
            data:  { status: 'Submitted', submittedAt: new Date() },
          })
          await appendEscrowEvent(tx, escrowId, 'MilestoneSubmitted', actorId, {
            milestoneId,
            title: milestone.title,
          })
          return updated
        }),
      this.app,
    )
  }

  async approveMilestone(escrowId: string, milestoneId: string, actorId: string) {
    const [escrowData, milestoneData] = await Promise.all([
      withDbErrorHandler(
        () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
        this.app,
      ),
      withDbErrorHandler(
        () => this.db.milestone.findUnique({ where: { id: milestoneId } }),
        this.app,
      ),
    ])

    if (!escrowData) throw this.app.httpErrors.notFound('Escrow not found')
    if (!milestoneData || milestoneData.escrowId !== escrowId) {
      throw this.app.httpErrors.notFound('Milestone not found')
    }

    const escrow    = EscrowAggregate.from(escrowData)
    const milestone = MilestoneEntity.from(milestoneData)

    if (!escrow.isParticipant(actorId)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (!escrow.canUserApprove(actorId)) {
      throw this.app.httpErrors.forbidden('Only the Payer can approve milestones')
    }
    if (!milestone.canBeApproved()) {
      throw this.app.httpErrors.badRequest(
        `Milestone cannot be approved from '${milestone.status}' state`,
      )
    }

    return withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const updated = await tx.milestone.update({
            where: { id: milestoneId },
            data:  { status: 'Approved', approvedAt: new Date() },
          })
          await appendEscrowEvent(tx, escrowId, 'MilestoneApproved', actorId, {
            milestoneId,
            title: milestone.title,
          })
          // TODO: trigger partial fund release for this milestone via Paystack
          return updated
        }),
      this.app,
    )
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getPublicView(code: string) {
    const escrow = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where:   { code },
          include: { participants: true },
        }),
      this.app,
    )
    if (!escrow) throw this.app.httpErrors.notFound('Escrow not found')

    if (escrow.expiresAt && escrow.expiresAt < new Date()) {
      throw this.app.httpErrors.gone(
        'This escrow link has expired. Contact the creator to generate a new one.',
      )
    }

    const payer = escrow.participants.find((p) => p.role === EscrowRole.Payer)
    const payee = escrow.participants.find((p) => p.role === EscrowRole.Payee)

    const fundedStatuses = new Set<string>([
      EscrowStatus.Funded,
      EscrowStatus.Held,
      EscrowStatus.AwaitingAction,
      EscrowStatus.Released,
    ])
    const isFunded = fundedStatuses.has(escrow.status)

    const missingRole: EscrowRole | null = !payer
      ? EscrowRole.Payer
      : !payee
        ? EscrowRole.Payee
        : null

    return {
      code:        escrow.code,
      title:       escrow.title,
      description: escrow.description,
      type:        escrow.type,
      status:      escrow.status,
      amount:      escrow.amount,
      currency:    escrow.currency,
      expiresAt:   escrow.expiresAt,
      isQuickLink: escrow.isQuickLink,
      isFunded,
      fundingWarning:
        !isFunded && payee
          ? 'This escrow has not been funded yet. Contact the payer before proceeding.'
          : null,
      missingParticipantRole: missingRole,
      payer: payer ? { name: payer.name, email: payer.email } : null,
      payee: payee ? { name: payee.name, email: payee.email } : null,
    }
  }

  async getByCode(code: string) {
    const escrow = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where:   { code },
          include: {
            creator: { select: { id: true, firstName: true, lastName: true, email: true } },
            participants: {
              include: { user: { select: { id: true, firstName: true, lastName: true } } },
            },
            milestones:    { orderBy: { order: 'asc' } },
            events:        { orderBy: { createdAt: 'desc' }, take: 20 },
            disputes:      true,
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

  // ── Internal ──────────────────────────────────────────────────────────────

  private async scheduleExpiryJob(escrowId: string, expiresAt: Date | null) {
    if (!expiresAt) return
    const delay = expiresAt.getTime() - Date.now()
    if (delay <= 0) return
    const { escrowQueue } = getQueues()
    await escrowQueue?.add(
      ESCROW_JOBS.EXPIRE_ESCROW,
      { escrowId },
      { delay, jobId: `expire:${escrowId}` },
    )
  }
}
