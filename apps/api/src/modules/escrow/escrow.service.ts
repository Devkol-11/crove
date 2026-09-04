import crypto from 'node:crypto'
import { customAlphabet } from 'nanoid'
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
  ConfirmQuickEscrowInput,
  JoinRequestInput,
  JoinVerifyInput,
  PaginationInput,
} from './escrow.schema'
import { sendEmail } from '../../third_party/email_providers'
import { otpJoinTemplate } from '../../config/email/templates/otp-join.template'
import { log } from '../../lib/logger'

const generateOtp              = customAlphabet('0123456789', 6)
const CREATION_OTP_TTL_SEC     = 10 * 60       // 10 minutes
const ACTION_TOKEN_TTL_SEC     = 24 * 60 * 60  // 24 hours
const JOIN_OTP_RATE_WINDOW_SEC = 5  * 60       // 5-minute rate-limit window

const intentKey      = (id: string)    => `crove:intent:${id}`
const actionTokenKey = (token: string) => `crove:atoken:${token}`
const joinRateKey    = (escrowId: string, email: string) => `crove:jotp-rate:${escrowId}:${email}`

interface StoredIntent {
  email: string
  data:  unknown
  otp:   string
}

interface StoredActionToken {
  escrowId: string
  email:    string
  role:     string
  action:   string
}
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
import { getQueues } from '../../pub_sub'
import { ESCROW_JOBS } from '../../pub_sub/workers/escrow.worker'
import { PAYOUT_JOBS } from '../../pub_sub/workers/payout.worker'
import { getActivePaymentProvider, getBachsInstance } from '../../third_party/payment_providers'
import type { PayeeAccountInput } from './escrow.schema'

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const atIndex = email.indexOf('@')
  if (atIndex < 0) return null
  const local = email.slice(0, atIndex)
  const domain = email.slice(atIndex)
  return `${local.slice(0, 2)}***${domain}`
}

function isParticipantMatch(
  participants: Array<{ userId: string | null; email: string | null }>,
  actorId: string,
  actorEmail?: string,
): boolean {
  return participants.some(
    (p) => p.userId === actorId || (p.userId === null && !!actorEmail && p.email === actorEmail),
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

  // ── Quick link creation — step 1: send creation OTP ─────────────────────

  async initiateQuick(input: CreateQuickEscrowInput) {
    const otp      = generateOtp()
    const intentId = crypto.randomBytes(16).toString('hex')

    await this.app.redis.setex(
      intentKey(intentId),
      CREATION_OTP_TTL_SEC,
      JSON.stringify({ email: input.creatorEmail, data: input, otp } satisfies StoredIntent),
    )

    const isDev = env.NODE_ENV !== 'production'

    if (isDev) {
      log.auth.info(
        { intentId, email: input.creatorEmail, otp, expiresInMinutes: 10 },
        'CREATION OTP — use this code to confirm your escrow (dev)',
      )
    }

    if (!isDev || env.DEV_OTP_EMAIL) {
      const deliverTo = isDev && env.DEV_OTP_EMAIL ? env.DEV_OTP_EMAIL : input.creatorEmail
      try {
        await sendEmail({
          to: deliverTo,
          ...otpJoinTemplate({
            recipientName:    input.creatorName,
            code:             otp,
            escrowTitle:      input.title,
            expiresInMinutes: 10,
          }),
        })
      } catch (err) {
        log.auth.error(
          { intentId, err: (err as Error).message },
          'Creation OTP email failed — code logged above',
        )
      }
    }

    return {
      intentId,
      message: 'OTP sent to your email. Enter it to create your escrow. Expires in 10 minutes.',
    }
  }

  // ── Quick link creation — step 2: confirm OTP + create escrow ────────────

  async confirmQuick(input: ConfirmQuickEscrowInput) {
    const raw = await this.app.redis.get(intentKey(input.intentId))
    if (!raw) throw this.app.httpErrors.gone('OTP has expired or does not exist — please start over')

    const intent = JSON.parse(raw) as StoredIntent
    if (intent.otp !== input.otp) throw this.app.httpErrors.badRequest('Invalid OTP code')

    // Consume atomically — DEL returns 0 if another request already claimed it
    const deleted = await this.app.redis.del(intentKey(input.intentId))
    if (deleted === 0) throw this.app.httpErrors.gone('This OTP has already been used')

    const escrowInput = intent.data as CreateQuickEscrowInput

    const result = await withDbErrorHandler(
      () => this.db.$transaction((tx) => createQuickLinkEscrow(tx, escrowInput)),
      this.app,
    )

    await this.scheduleExpiryJob(result.escrow.id, result.escrow.expiresAt)

    // Payer-creator gets a fund token immediately — they can fund without a Crove account
    let fundToken: string | undefined
    if (escrowInput.creatorRole === EscrowRole.Payer) {
      fundToken = await this.issueActionToken(
        result.escrow.id,
        escrowInput.creatorEmail,
        EscrowRole.Payer,
        'fund',
      )
    }

    // Payee-creator: provision a Bachs Connect account so we can transfer on release
    if (escrowInput.creatorRole === EscrowRole.Payee && escrowInput.payeeAccount) {
      const creatorParticipant = result.escrow.participants.find((p) => p.role === EscrowRole.Payee)
      if (creatorParticipant) {
        const bachsAccountId = await this.initPayeeBachsAccount(
          escrowInput.creatorEmail,
          escrowInput.creatorName,
          escrowInput.payeeAccount,
          result.escrow.currency,
        )
        if (bachsAccountId) {
          await this.db.escrowParticipant.update({
            where: { id: creatorParticipant.id },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { bachsAccountId } as any,
          })
        }
      }
    }

    return {
      ...result,
      creatorRole: escrowInput.creatorRole,
      ...(fundToken !== undefined ? { fundToken } : {}),
    }
  }

  // ── Fund with action token (no Crove account required) ───────────────────

  async fundEscrowWithToken(escrowId: string, fundToken: string) {
    const raw = await this.app.redis.get(actionTokenKey(fundToken))
    if (!raw) throw this.app.httpErrors.unauthorized('Invalid or expired fund token')

    const actionToken = JSON.parse(raw) as StoredActionToken

    if (actionToken.escrowId !== escrowId || actionToken.action !== 'fund') {
      throw this.app.httpErrors.unauthorized('Invalid fund token')
    }
    if (actionToken.role !== EscrowRole.Payer) {
      throw this.app.httpErrors.forbidden('Only a Payer token can fund an escrow')
    }

    const payerEmail = actionToken.email

    const data = await withDbErrorHandler(
      () =>
        this.db.escrow.findUnique({
          where: { id: escrowId },
          include: {
            participants: { include: { user: { select: { email: true, name: true } } } },
          },
        }),
      this.app,
    )
    if (!data) throw this.app.httpErrors.notFound('Escrow not found')

    const escrow = EscrowAggregate.from(data)

    // Match payer by the verified email on the token — userId is null for quick-link participants
    const payerParticipant = data.participants.find(
      (p) =>
        p.role === EscrowRole.Payer &&
        (p.email === payerEmail || p.user?.email === payerEmail),
    )
    if (!payerParticipant) {
      throw this.app.httpErrors.forbidden('No Payer participant found matching this token')
    }

    const payeeParticipant = data.participants.find((p) => p.role === EscrowRole.Payee)
    if (!payeeParticipant) {
      throw this.app.httpErrors.badRequest(
        'The payee has not joined yet — share the payment link with them first.',
      )
    }
    if (!payeeParticipant.accountNumber) {
      throw this.app.httpErrors.badRequest(
        "The payee hasn't added their bank account details yet — funding is on hold.",
      )
    }

    if (escrow.status !== EscrowStatus.AwaitingPayment) {
      try {
        escrow.assertCanTransitionTo(EscrowStatus.AwaitingPayment)
      } catch (err) {
        throw mapDomainError(err, this.app)
      }
    }

    const payerName = payerParticipant.user?.name ?? payerParticipant.name ?? undefined

    const reference = `ESC-${escrowId.slice(0, 8).toUpperCase()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`
    const provider  = getActivePaymentProvider()

    const payment = await withDbErrorHandler(
      () =>
        createPaymentRecord(this.db, {
          escrowId,
          reference,
          provider:   env.ACTIVE_PAYMENT_PROVIDER,
          amount:     escrow.amount,
          currency:   escrow.currency,
          payerEmail,
        }),
      this.app,
    )

    let initiationResult
    try {
      initiationResult = await provider.initiatePayment({
        amount:       Math.round(escrow.amount * 100),
        currency:     escrow.currency,
        email:        payerEmail,
        customerName: payerName,
        reference,
        callbackUrl:  `${env.FRONTEND_URL}/e/${escrow.code}?payment=complete`,
        metadata:     { escrowId, payerEmail, paymentId: payment.id },
      })
    } catch (err) {
      await this.db.payment.update({ where: { id: payment.id }, data: { status: 'Failed' } })
      throw this.app.httpErrors.badGateway('Payment provider error. Please try again.')
    }

    // Token is consumed only after a successful provider response — errors above leave it intact
    await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data:  {
              authorizationUrl: initiationResult.authorizationUrl,
              providerRef:      initiationResult.providerRef,
            },
          })

          if (escrow.status !== EscrowStatus.AwaitingPayment) {
            await tx.escrow.update({
              where: { id: escrowId },
              data:  { status: EscrowStatus.AwaitingPayment },
            })
          }

          await createTransaction(tx, {
            escrowId,
            type:        TransactionType.Funding,
            amount:      escrow.amount,
            currency:    escrow.currency,
            provider:    env.ACTIVE_PAYMENT_PROVIDER,
            providerRef: reference,
          })

          await appendEscrowEvent(tx, escrowId, 'PaymentInitiated', payerEmail, {
            reference,
            method: 'quickFundToken',
          })
        }),
      this.app,
    )

    // Consume the token after DB commits — provider already succeeded so there's no retry path
    await this.app.redis.del(actionTokenKey(fundToken))

    return {
      paymentLink: initiationResult.authorizationUrl,
      reference,
    }
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
    const rateResults = await this.app.redis
      .pipeline()
      .incr(joinRateKey(escrow.id, input.email))
      .expire(joinRateKey(escrow.id, input.email), JOIN_OTP_RATE_WINDOW_SEC)
      .exec()
    const requestCount = (rateResults?.[0]?.[1] as number) ?? 0
    if (requestCount > 3) {
      throw this.app.httpErrors.tooManyRequests(
        'Too many OTP requests for this email. Please wait 5 minutes before trying again.',
      )
    }

    await createJoinOtp(this.app.redis, escrow.id, input.name, input.email, escrow.title)

    return {
      message: 'OTP sent to your email. It expires in 10 minutes.',
      escrow: {
        title:    escrow.title,
        amount:   escrow.amount,
        currency: escrow.currency,
        status:   escrow.status,
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

    const otp = await verifyJoinOtp(this.app.redis, escrow.id, input.email, input.otp)
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
              escrowId:      escrow.id,
              userId:        null,
              name:          otp.name,
              email:         otp.email,
              role:          recipientRole,
              accountNumber: input.payeeAccount?.accountNumber,
              bankCode:      input.payeeAccount?.bankCode,
              bankName:      input.payeeAccount?.bankName,
              accountName:   input.payeeAccount?.accountName,
            },
          })
          await appendEscrowEvent(tx, escrow.id, 'ParticipantJoined', otp.email, {
            role: recipientRole,
          })
          return created
        }),
      this.app,
    )

    // Payer joiner gets a fund token — they can fund without a Crove account
    let fundToken: string | undefined
    if (recipientRole === EscrowRole.Payer) {
      fundToken = await this.issueActionToken(escrow.id, otp.email, EscrowRole.Payer, 'fund')
    }

    // Payee joiner: provision a Bachs Connect account so we can transfer on release
    if (recipientRole === EscrowRole.Payee && input.payeeAccount) {
      const bachsAccountId = await this.initPayeeBachsAccount(
        otp.email,
        otp.name,
        input.payeeAccount,
        escrow.currency,
      )
      if (bachsAccountId) {
        await this.db.escrowParticipant.update({
          where: { id: participant.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { bachsAccountId } as any,
        })
      }
    }

    // Build funding notice now that the participant is confirmed in the escrow
    const fundedStatuses = new Set<string>([
      EscrowStatus.Funded,
      EscrowStatus.Held,
      EscrowStatus.AwaitingAction,
      EscrowStatus.Released,
    ])
    const isFunded = fundedStatuses.has(escrow.status)

    let fundingNotice: string
    if (recipientRole === EscrowRole.Payer) {
      fundingNotice = isFunded
        ? 'This escrow is already funded — the money is locked in and waiting.'
        : 'You\'re in! Use your fund token to deposit the funds and activate this escrow.'
    } else {
      fundingNotice = isFunded
        ? 'Great news — this escrow is already funded! The money is locked in and waiting. Do your thing and get paid.'
        : "You're in! This escrow hasn't been funded yet. You'll be notified as soon as the payer deposits."
    }

    return {
      participant,
      escrow: {
        code:     escrow.code,
        title:    escrow.title,
        amount:   escrow.amount,
        currency: escrow.currency,
        status:   escrow.status,
        isFunded,
        fundingNotice,
      },
      ...(fundToken !== undefined ? { fundToken } : {}),
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
      (p) => p.userId === actorId || (p.userId === null && !!actorEmail && p.email === actorEmail),
    )
    const payerEmail = payerParticipant?.user?.email ?? payerParticipant?.email
    const payerName = payerParticipant?.user?.name ?? payerParticipant?.name ?? undefined
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
        amount: Math.round(escrow.amount * 100), // minor units (kobo / cents)
        currency: escrow.currency,
        email: payerEmail,
        customerName: payerName,
        reference,
        callbackUrl: `${env.FRONTEND_URL}/e/${escrow.code}?payment=complete`,
        metadata: { escrowId, actorId, paymentId: payment.id },
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

    // Enqueue payout to the payee's Bachs Connect account
    const payeeParticipant = data.participants.find((p) => p.role === EscrowRole.Payee)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payeeBachsAccountId = (payeeParticipant as any)?.bachsAccountId as string | null | undefined
    if (payeeBachsAccountId) {
      const { payoutQueue } = getQueues()
      const ref = `PAYOUT-${escrowId.slice(0, 8).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      await payoutQueue?.add(
        PAYOUT_JOBS.PROCESS_PAYOUT,
        { escrowId, payeeAccountId: payeeBachsAccountId, amount: escrow.amount, currency: escrow.currency, reference: ref },
        { jobId: `payout-${escrowId}` },
      )
    } else {
      log.auth.warn({ escrowId }, 'payee has no Bachs account — payout skipped')
    }

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
    const escrow = EscrowAggregate.from(data.escrow)

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

    const newEscrowStatus = decision === 'release' ? EscrowStatus.Released : EscrowStatus.Refunded

    try {
      escrow.assertCanTransitionTo(newEscrowStatus)
    } catch (err) {
      throw mapDomainError(err, this.app)
    }

    const updatedEscrow = await withDbErrorHandler(
      () =>
        this.db.$transaction(async (tx) => {
          await tx.escrowDispute.update({
            where: { id: disputeId },
            data: { status: 'Resolved', resolution, resolvedAt: new Date() },
          })

          const result = await tx.escrow.update({
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

          return result
        }),
      this.app,
    )

    if (decision === 'release') {
      const payeeParticipant = data.escrow.participants.find((p) => p.role === EscrowRole.Payee)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payeeBachsAccountId = (payeeParticipant as any)?.bachsAccountId as string | null | undefined
      if (payeeBachsAccountId) {
        const { payoutQueue } = getQueues()
        const ref = `PAYOUT-${data.escrow.id.slice(0, 8).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
        await payoutQueue?.add(
          PAYOUT_JOBS.PROCESS_PAYOUT,
          { escrowId: data.escrow.id, payeeAccountId: payeeBachsAccountId, amount: escrow.amount, currency: escrow.currency, reference: ref },
          { jobId: `payout-${data.escrow.id}` },
        )
      } else {
        log.auth.warn({ escrowId: data.escrow.id }, 'payee has no Bachs account — payout skipped after dispute release')
      }
    }

    return updatedEscrow
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

    const escrow = EscrowAggregate.from(escrowData)
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

    const escrow = EscrowAggregate.from(escrowData)
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

    // Enqueue partial payout for this milestone
    const payeeParticipant = escrowData.participants.find((p) => p.role === EscrowRole.Payee)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payeeBachsAccountId = (payeeParticipant as any)?.bachsAccountId as string | null | undefined
    if (payeeBachsAccountId) {
      const { payoutQueue } = getQueues()
      const ref = `PAYOUT-MLT-${milestoneId.slice(0, 8).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      await payoutQueue?.add(
        PAYOUT_JOBS.PROCESS_PAYOUT,
        { escrowId, payeeAccountId: payeeBachsAccountId, amount: Number(milestoneData.amount), currency: escrowData.currency, reference: ref, milestoneId },
        { jobId: `payout-milestone-${milestoneId}` },
      )
    } else {
      log.auth.warn({ escrowId, milestoneId }, 'payee has no Bachs account — milestone payout skipped')
    }

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
      escrow.creatorId === actorId || isParticipantMatch(escrow.participants, actorId, actorEmail)

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
      data.creatorId === actorId || isParticipantMatch(data.participants, actorId, actorEmail)

    if (!isAuthorized) {
      throw this.app.httpErrors.forbidden('You are not a participant in this escrow')
    }

    return withDbErrorHandler(() => getLedgerBalance(this.db, escrowId), this.app)
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async initPayeeBachsAccount(
    email: string,
    name: string,
    bankDetails: PayeeAccountInput,
    currency: string,
  ): Promise<string | null> {
    if (env.ACTIVE_PAYMENT_PROVIDER !== 'bachs') return null
    try {
      const bachs = getBachsInstance()
      const accountId = await bachs.createConnectAccount(email, name)
      await bachs.setupPayeeAccount(accountId, {
        balanceCurrencies: [currency],
        payoutDestination: {
          type: 'bank_account',
          accountNumber: bankDetails.accountNumber,
          accountName: bankDetails.accountName,
          bankCode: bankDetails.bankCode,
          currency,
        },
        persons: [{ name, email }],
      })
      return accountId
    } catch (err) {
      log.auth.error(
        { err: (err as Error).message, email },
        'Bachs Connect account creation failed — payee will need manual setup',
      )
      return null
    }
  }

  private async issueActionToken(
    escrowId: string,
    email: string,
    role: EscrowRole,
    action: string,
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex') // 64-char hex

    await this.app.redis.setex(
      actionTokenKey(token),
      ACTION_TOKEN_TTL_SEC,
      JSON.stringify({ escrowId, email, role, action } satisfies StoredActionToken),
    )

    return token
  }

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
