import crypto from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { env } from '../../config'
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
  PaginationInput,
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
import { EscrowDisputedEvent } from './domain/events/escrow-disputed.event'
import { MilestoneSubmittedEvent } from './domain/events/milestone-submitted.event'
import { MilestoneApprovedEvent } from './domain/events/milestone-approved.event'
import { createTransaction } from './domain/helpers/transaction.helper'
import { appendLedgerEntry, getLedgerBalance } from './domain/helpers/ledger.helper'
import { createPaymentRecord } from './domain/helpers/payment.helper'
import { eventDispatcher } from '../../lib/event-dispatcher'
import { withDbErrorHandler } from '../../lib/db.error.handler'
import { mapDomainError } from '../../lib/domain.error.mapper'
import { getQueues } from '../../queues'
import { ESCROW_JOBS } from '../../queues/workers/escrow.worker'
import { getActivePaymentProvider } from '../../third_party/payment_providers'

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const atIndex = email.indexOf('@')
  if (atIndex < 0) return null
  const local  = email.slice(0, atIndex)
  const domain = email.slice(atIndex)
  return `${local.slice(0, 2)}***${domain}`
}

function isParticipantMatch(
  participants: Array<{ userId: string | null; email: string | null }>,
  actorId: string,
  actorEmail?: string,
): boolean {
  return participants.some(
    (p) =>
      p.userId === actorId ||
      (p.userId === null && !!actorEmail && p.email === actorEmail),
  )
}

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
            case EscrowType.Standard:
              return createStandardEscrow(tx, creatorId, input)
            case EscrowType.Milestone:
              return createMilestoneEscrow(tx, creatorId, input)
            case EscrowType.Conditional:
              return createConditionalEscrow(tx, creatorId, input)
            case EscrowType.Deposit:
              return createDepositEscrow(tx, creatorId, input)
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
          where: { code },
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

    // Rate-limit: max 3 OTP requests per email+escrow per 5 minutes
    const recentOtpCount = await withDbErrorHandler(
      () =>
        this.db.escrowJoinOtp.count({
          where: {
            escrowId: escrow.id,
            email: input.email,
            createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
          },
        }),
      this.app,
    )
    if (recentOtpCount >= 3) {
      throw this.app.httpErrors.tooManyRequests(
        'Too many OTP requests for this email. Please wait 5 minutes before trying again.',
      )
    }

    await createJoinOtp(this.db, escrow.id, input.name, input.email)

    const fundedStatuses = new Set<string>([
      EscrowStatus.Funded,
      EscrowStatus.Held,
      EscrowStatus.AwaitingAction,
      EscrowStatus.Released,
    ])
    const isFunded = fundedStatuses.has(escrow.status)
    const creatorRole = escrow.participants[0]?.role as EscrowRole | undefined
    const payeeCreated = creatorRole === EscrowRole.Payee

    let fundingNotice: string
    if (isFunded) {
      fundingNotice = payeeCreated
        ? 'Great news — this escrow is already funded! The money is locked in and waiting. Do your thing and get paid.'
        : 'This escrow is fully funded and the money is locked in safely. Deliver the goods and get your release!'
    } else if (payeeCreated) {
      fundingNotice = `${input.name.split(' ')[0]}, you're the last piece of the puzzle! The payee has set everything up and is ready to go. Once you fund this escrow, the work kicks off and your money stays protected until you're satisfied.`
    } else {
      fundingNotice =
        "Heads up — this escrow hasn't been funded yet. The payer still needs to deposit before things get moving. You'll be notified once the money is in."
    }

    return {
      message: 'OTP sent to your email. It expires in 10 minutes.',
      escrow: {
        title: escrow.title,
        amount: escrow.amount,
        currency: escrow.currency,
        status: escrow.status,
        isFunded,
        fundingNotice,
      },
    }
  }

  async verifyJoinAndJoin(code: string, input: JoinVerifyInput) {
    const escrow = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where: { code },
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

    if (recipientRole === EscrowRole.Payee && !input.payeeAccount) {
      throw this.app.httpErrors.badRequest(
        'Your bank account details are required to join as the Payee. Please provide your account number, bank, and account name.',
      )
    }

    const participant = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const created = await tx.escrowParticipant.create({
            data: {
              escrowId: escrow.id,
              userId: null,
              name: otp.name,
              email: otp.email,
              role: recipientRole,
              accountNumber: input.payeeAccount?.accountNumber,
              bankCode: input.payeeAccount?.bankCode,
              bankName: input.payeeAccount?.bankName,
              accountName: input.payeeAccount?.accountName,
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
        code: escrow.code,
        title: escrow.title,
        amount: escrow.amount,
        currency: escrow.currency,
        status: escrow.status,
      },
    }
  }

  // ── Fund — initiates payment, returns checkout link ───────────────────────

  async fundEscrow(escrowId: string, actorId: string, actorEmail?: string) {
    const data = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where: { id: escrowId },
          include: {
            participants: {
              include: { user: { select: { email: true, name: true } } },
            },
          },
        }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(actorId, actorEmail)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (!escrow.canUserFund(actorId, actorEmail)) {
      throw this.app.httpErrors.forbidden('Only the Payer can fund an escrow')
    }

    const payeeParticipant = data.participants.find((p) => p.role === EscrowRole.Payee)

    if (!payeeParticipant) {
      throw this.app.httpErrors.badRequest(
        'The payee has not joined this escrow yet. Share the payment link with them first.',
      )
    }
    if (!payeeParticipant.accountNumber) {
      throw this.app.httpErrors.badRequest(
        "The payee hasn't added their bank account details yet. Funding is on hold until they do.",
      )
    }

    if (escrow.status !== EscrowStatus.AwaitingPayment) {
      try {
        escrow.assertCanTransitionTo(EscrowStatus.AwaitingPayment)
      } catch (err) {
        throw mapDomainError(err, this.app)
      }
    }

    // Resolve payer email — authenticated users have it via the User relation;
    // quick-link participants carry it directly on the participant row.
    const payerParticipant = data.participants.find(
      (p) =>
        p.userId === actorId ||
        (p.userId === null && !!actorEmail && p.email === actorEmail),
    )
    const payerEmail = payerParticipant?.user?.email ?? payerParticipant?.email
    const payerName  = payerParticipant?.user?.name  ?? payerParticipant?.name  ?? undefined
    if (!payerEmail) {
      throw this.app.httpErrors.badRequest('Payer email could not be resolved')
    }

    // Cryptographically random suffix prevents reference collision and timestamp-based prediction
    const reference = `ESC-${escrowId.slice(0, 8).toUpperCase()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`
    const provider = getActivePaymentProvider()

    const payment = await withDbErrorHandler(
      () =>
        createPaymentRecord(this.db, {
          escrowId,
          reference,
          provider: env.ACTIVE_PAYMENT_PROVIDER,
          amount: escrow.amount,
          currency: escrow.currency,
          payerEmail,
        }),
      this.app,
    )

    let initiationResult
    try {
      initiationResult = await provider.initiatePayment({
        amount:       Math.round(escrow.amount * 100), // minor units (kobo / cents)
        currency:     escrow.currency,
        email:        payerEmail,
        customerName: payerName,
        reference,
        callbackUrl:  `${env.FRONTEND_URL}/e/${escrow.code}?payment=complete`,
        metadata:     { escrowId, actorId, paymentId: payment.id },
      })
    } catch (err) {
      await this.db.payment.update({
        where: { id: payment.id },
        data: { status: 'Failed' },
      })
      throw this.app.httpErrors.badGateway('Payment provider error. Please try again.')
    }

    await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              authorizationUrl: initiationResult.authorizationUrl,
              providerRef: initiationResult.providerRef,
            },
          })

          if (escrow.status !== EscrowStatus.AwaitingPayment) {
            await tx.escrow.update({
              where: { id: escrowId },
              data: { status: EscrowStatus.AwaitingPayment },
            })
          }

          await createTransaction(tx, {
            escrowId,
            type: TransactionType.Funding,
            amount: escrow.amount,
            currency: escrow.currency,
            provider: env.ACTIVE_PAYMENT_PROVIDER,
            providerRef: reference,
          })

          await appendEscrowEvent(tx, escrowId, 'PaymentInitiated', actorId, { reference })
        }),
      this.app,
    )

    return {
      paymentLink: initiationResult.authorizationUrl,
      reference,
    }
  }

  // ── Release ───────────────────────────────────────────────────────────────

  async releaseEscrow(escrowId: string, actorId: string, actorEmail?: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(actorId, actorEmail)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (!escrow.canUserApprove(actorId, actorEmail)) {
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
            data: { status: EscrowStatus.Released, releasedAt: new Date() },
          })
          await appendEscrowEvent(tx, escrowId, 'StatusChangedToReleased', actorId)
          await appendLedgerEntry(tx, {
            escrowId,
            type: LedgerEntryType.Release,
            amount: escrow.amount,
            currency: escrow.currency,
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
  //
  // Refund is only available from AwaitingAction (platform review concluded).
  // Disputed escrows must be refunded via resolveDispute, not this endpoint.
  // Only the Payer can initiate a refund — it's their money going back to them.

  async refundEscrow(escrowId: string, actorId: string, actorEmail?: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(actorId, actorEmail)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (!escrow.canUserApprove(actorId, actorEmail)) {
      throw this.app.httpErrors.forbidden('Only the Payer can request a refund')
    }
    if (escrow.status !== EscrowStatus.AwaitingAction) {
      throw this.app.httpErrors.badRequest(
        'Refunds can only be initiated while the escrow is under platform review (AwaitingAction). For disputed escrows, use the dispute resolution flow.',
      )
    }

    return withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.escrow.update({
            where: { id: escrowId },
            data: { status: EscrowStatus.Refunded },
          })
          await appendEscrowEvent(tx, escrowId, 'StatusChangedToRefunded', actorId)
          await appendLedgerEntry(tx, {
            escrowId,
            userId: actorId,
            type: LedgerEntryType.Refund,
            amount: escrow.amount,
            currency: escrow.currency,
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

    if (!escrow.isCreatedBy(actorId)) {
      throw this.app.httpErrors.forbidden('Only the escrow creator can cancel it')
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
            data: { status: EscrowStatus.Cancelled },
          })
          await appendEscrowEvent(tx, escrowId, 'StatusChangedToCancelled', actorId)
          return result
        }),
      this.app,
    )
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

  async openDispute(escrowId: string, raisedById: string, reason: string, raisedByEmail?: string) {
    const data = await withDbErrorHandler(
      () => this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    if (!escrow.isParticipant(raisedById, raisedByEmail)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    // Prevent duplicate active disputes on the same escrow
    const activeDispute = await withDbErrorHandler(
      () =>
        this.db.escrowDispute.findFirst({
          where: { escrowId, status: { in: ['Open', 'UnderReview'] } },
          select: { id: true },
        }),
      this.app,
    )
    if (activeDispute) {
      throw this.app.httpErrors.conflict(
        'An active dispute already exists for this escrow. Resolve it before opening a new one.',
      )
    }

    try {
      escrow.assertCanTransitionTo(EscrowStatus.Disputed)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    const dispute = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const created = await tx.escrowDispute.create({
            data: { escrowId, raisedById, reason },
          })
          await tx.escrow.update({
            where: { id: escrowId },
            data: { status: EscrowStatus.Disputed },
          })
          await appendEscrowEvent(tx, escrowId, 'DisputeOpened', raisedById, { reason })
          return created
        }),
      this.app,
    )

    await eventDispatcher.dispatch(new EscrowDisputedEvent(escrowId, raisedById, reason))

    return dispute
  }

  async resolveDispute(
    disputeId: string,
    resolution: string,
    decision: 'release' | 'refund',
    resolvedById: string,
    resolvedByEmail?: string,
  ) {
    const data = await withDbErrorHandler(
      () =>
        this.db.escrowDispute.findUnique({
          where: { id: disputeId },
          include: { escrow: { include: { participants: true } } },
        }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Dispute not found')

    const dispute = EscrowDisputeEntity.from(data)
    const escrow  = EscrowAggregate.from(data.escrow)

    if (!escrow.isParticipant(resolvedById, resolvedByEmail)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    // The party who raised the dispute cannot also resolve it — the other side must accept
    if (dispute.raisedById === resolvedById) {
      throw this.app.httpErrors.forbidden(
        'You cannot resolve your own dispute. The other party must accept the resolution.',
      )
    }

    try {
      dispute.assertCanResolve()
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    const newEscrowStatus =
      decision === 'release' ? EscrowStatus.Released : EscrowStatus.Refunded

    try {
      escrow.assertCanTransitionTo(newEscrowStatus)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    return withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          await tx.escrowDispute.update({
            where: { id: disputeId },
            data: { status: 'Resolved', resolution, resolvedAt: new Date() },
          })

          const updatedEscrow = await tx.escrow.update({
            where: { id: dispute.escrowId },
            data: {
              status: newEscrowStatus,
              ...(decision === 'release' ? { releasedAt: new Date() } : {}),
            },
          })

          await appendEscrowEvent(tx, dispute.escrowId, 'DisputeResolved', resolvedById, {
            decision,
            resolution,
          })

          await appendLedgerEntry(tx, {
            escrowId: dispute.escrowId,
            type: decision === 'release' ? LedgerEntryType.Release : LedgerEntryType.Refund,
            amount: escrow.amount,
            currency: escrow.currency,
            description:
              decision === 'release'
                ? `Escrow ${escrow.code} released to payee via dispute resolution`
                : `Escrow ${escrow.code} refunded to payer via dispute resolution`,
          })

          return updatedEscrow
        }),
      this.app,
    )
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  async submitMilestone(
    escrowId: string,
    milestoneId: string,
    actorId: string,
    actorEmail?: string,
  ) {
    const [escrowData, milestoneData] = await Promise.all([
      withDbErrorHandler(
        () =>
          this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
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

    if (!escrow.isParticipant(actorId, actorEmail)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (escrow.getRoleForUser(actorId, actorEmail) !== EscrowRole.Payee) {
      throw this.app.httpErrors.forbidden('Only the Payee can submit milestones')
    }
    if (!milestone.canBeSubmitted()) {
      throw this.app.httpErrors.badRequest(
        `Milestone cannot be submitted from '${milestone.status}' state`,
      )
    }

    const updated = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.milestone.update({
            where: { id: milestoneId },
            data: { status: 'Submitted', submittedAt: new Date() },
          })
          await appendEscrowEvent(tx, escrowId, 'MilestoneSubmitted', actorId, {
            milestoneId,
            title: milestone.title,
          })
          return result
        }),
      this.app,
    )

    await eventDispatcher.dispatch(
      new MilestoneSubmittedEvent(escrowId, milestoneId, actorId, milestone.title),
    )

    return updated
  }

  async approveMilestone(
    escrowId: string,
    milestoneId: string,
    actorId: string,
    actorEmail?: string,
  ) {
    const [escrowData, milestoneData] = await Promise.all([
      withDbErrorHandler(
        () =>
          this.db.escrow.findUnique({ where: { id: escrowId }, include: { participants: true } }),
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

    if (!escrow.isParticipant(actorId, actorEmail)) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }
    if (!escrow.canUserApprove(actorId, actorEmail)) {
      throw this.app.httpErrors.forbidden('Only the Payer can approve milestones')
    }
    if (!milestone.canBeApproved()) {
      throw this.app.httpErrors.badRequest(
        `Milestone cannot be approved from '${milestone.status}' state`,
      )
    }

    const approved = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          const result = await tx.milestone.update({
            where: { id: milestoneId },
            data: { status: 'Approved', approvedAt: new Date() },
          })
          await appendEscrowEvent(tx, escrowId, 'MilestoneApproved', actorId, {
            milestoneId,
            title: milestone.title,
          })
          return result
        }),
      this.app,
    )

    await eventDispatcher.dispatch(
      new MilestoneApprovedEvent(
        escrowId,
        milestoneId,
        actorId,
        Number(milestoneData.amount),
        escrowData.currency,
      ),
    )

    return approved
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getPublicView(code: string) {
    const escrow = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where: { code },
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
      code: escrow.code,
      title: escrow.title,
      description: escrow.description,
      type: escrow.type,
      status: escrow.status,
      amount: escrow.amount,
      currency: escrow.currency,
      expiresAt: escrow.expiresAt,
      isQuickLink: escrow.isQuickLink,
      isFunded,
      fundingWarning:
        !isFunded && payee
          ? 'This escrow has not been funded yet. Contact the payer before proceeding.'
          : null,
      missingParticipantRole: missingRole,
      // Emails are masked on the public view to prevent enumeration
      payer: payer ? { name: payer.name, email: maskEmail(payer.email) } : null,
      payee: payee ? { name: payee.name, email: maskEmail(payee.email) } : null,
    }
  }

  async getByCode(code: string, actorId: string, actorEmail?: string) {
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

    const isAuthorized =
      escrow.creatorId === actorId ||
      isParticipantMatch(escrow.participants, actorId, actorEmail)

    if (!isAuthorized) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    return escrow
  }

  async listByUser(userId: string, pagination: PaginationInput) {
    const { page, limit } = pagination
    return withDbErrorHandler(
      () =>
        this.db.escrow.findMany({
          where: {
            OR: [{ creatorId: userId }, { participants: { some: { userId } } }],
          },
          include: { milestones: { orderBy: { order: 'asc' } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      this.app,
    )
  }

  async getLedgerBalance(escrowId: string, actorId: string, actorEmail?: string) {
    const data = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where: { id: escrowId },
          include: { participants: true },
        }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const isAuthorized =
      data.creatorId === actorId ||
      isParticipantMatch(data.participants, actorId, actorEmail)

    if (!isAuthorized) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

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
      { delay, jobId: `expire-${escrowId}` },
    )
  }
}
