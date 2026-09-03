import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'
import type { DomainEvent } from '../../shared/base/DomainEvent'
import type { EscrowCreatedEvent } from '../../modules/escrow/domain/events/escrow-created.event'
import type { EscrowFundedEvent } from '../../modules/escrow/domain/events/escrow-funded.event'
import type { EscrowReleasedEvent } from '../../modules/escrow/domain/events/escrow-released.event'
import type { EscrowDisputedEvent } from '../../modules/escrow/domain/events/escrow-disputed.event'
import type { MilestoneSubmittedEvent } from '../../modules/escrow/domain/events/milestone-submitted.event'
import type { MilestoneApprovedEvent } from '../../modules/escrow/domain/events/milestone-approved.event'
import { db } from '../../lib/prisma'
import { log } from '../../lib/logger'
import { sendEmail } from '../../third_party/email_providers'
import { welcomeTemplate } from '../../config/email/templates/welcome.template'
import { emailVerifiedTemplate } from '../../config/email/templates/email-verified.template'
import { escrowCreatedTemplate } from '../../config/email/templates/escrow-created.template'
import { escrowFundedTemplate } from '../../config/email/templates/escrow-funded.template'
import { escrowReleasedTemplate } from '../../config/email/templates/escrow-released.template'
import { escrowDisputedTemplate } from '../../config/email/templates/escrow-disputed.template'
import { milestoneSubmittedTemplate } from '../../config/email/templates/milestone-submitted.template'
import { milestoneApprovedTemplate } from '../../config/email/templates/milestone-approved.template'

const workerLog = log.worker.notifications

// ── Helper: resolve participant email + display name ──────────────────────────

async function getParticipantContacts(escrowId: string) {
  const participants = await db.escrowParticipant.findMany({
    where:   { escrowId },
    include: { user: { select: { email: true, firstName: true, name: true } } },
  })

  const payer = participants.find((p) => p.role === 'Payer')
  const payee = participants.find((p) => p.role === 'Payee')

  function contact(p: typeof payer) {
    if (!p) return null
    const email = p.user?.email ?? p.email
    const name  = p.user?.firstName ?? p.name ?? 'there'
    return email ? { email, name } : null
  }

  return { payer: contact(payer), payee: contact(payee) }
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleUserRegistered(event: DomainEvent) {
  const user = await db.user.findUnique({ where: { id: event.aggregateId } })
  if (!user?.email) return

  const firstName = user.firstName ?? user.name.split(' ')[0] ?? 'there'
  await sendEmail({ to: user.email, ...welcomeTemplate({ firstName }) })
  workerLog.info({ userId: user.id }, 'welcome email sent')
}

async function handleEmailVerified(event: DomainEvent) {
  const user = await db.user.findUnique({ where: { id: event.aggregateId } })
  if (!user?.email) return

  const firstName = user.firstName ?? user.name.split(' ')[0] ?? 'there'
  await sendEmail({ to: user.email, ...emailVerifiedTemplate({ firstName }) })
  workerLog.info({ userId: user.id }, 'email-verified notification sent')
}

async function handleEscrowCreated(event: DomainEvent) {
  const e = event as EscrowCreatedEvent

  const escrow = await db.escrow.findUnique({ where: { id: e.aggregateId } })
  if (!escrow) return

  // For quick-link escrows, look up creator by email on the participant row
  const creatorParticipant = await db.escrowParticipant.findFirst({
    where:   { escrowId: e.aggregateId, role: 'Payer' },
    include: { user: { select: { email: true, firstName: true, name: true } } },
  })
  const creatorEmail = creatorParticipant?.user?.email ?? creatorParticipant?.email
  if (!creatorEmail) return

  const creatorName =
    creatorParticipant?.user?.firstName ??
    creatorParticipant?.name ??
    'there'

  await sendEmail({
    to: creatorEmail,
    ...escrowCreatedTemplate({
      creatorName,
      escrowTitle: escrow.title,
      amount:      Number(escrow.amount),
      currency:    escrow.currency,
      escrowType:  escrow.type,
      code:        escrow.code,
      paymentLink: `${escrow.code}`, // resolved in template with FRONTEND_URL
    }),
  })
  workerLog.info({ escrowId: e.aggregateId }, 'escrow-created email sent')
}

async function handleEscrowFunded(event: DomainEvent) {
  const e = event as EscrowFundedEvent

  const escrow = await db.escrow.findUnique({ where: { id: e.aggregateId } })
  if (!escrow) return

  const { payer, payee } = await getParticipantContacts(e.aggregateId)
  const amount   = e.amount
  const currency = e.currency

  if (payer) {
    await sendEmail({
      to: payer.email,
      ...escrowFundedTemplate({
        recipientName: payer.name,
        escrowTitle:   escrow.title,
        amount,
        currency,
        role:          'Payer',
        code:          escrow.code,
      }),
    })
  }

  if (payee) {
    await sendEmail({
      to: payee.email,
      ...escrowFundedTemplate({
        recipientName: payee.name,
        escrowTitle:   escrow.title,
        amount,
        currency,
        role:          'Payee',
        code:          escrow.code,
      }),
    })
  }

  workerLog.info({ escrowId: e.aggregateId }, 'escrow-funded emails sent')
}

async function handleEscrowReleased(event: DomainEvent) {
  const e = event as EscrowReleasedEvent

  const escrow = await db.escrow.findUnique({ where: { id: e.aggregateId } })
  if (!escrow) return

  const { payee } = await getParticipantContacts(e.aggregateId)
  if (!payee) return

  await sendEmail({
    to: payee.email,
    ...escrowReleasedTemplate({
      payeeName:   payee.name,
      escrowTitle: escrow.title,
      amount:      e.amount,
      currency:    e.currency,
      code:        escrow.code,
    }),
  })
  workerLog.info({ escrowId: e.aggregateId }, 'escrow-released email sent')
}

async function handleEscrowDisputed(event: DomainEvent) {
  const e = event as EscrowDisputedEvent

  const escrow = await db.escrow.findUnique({ where: { id: e.aggregateId } })
  if (!escrow) return

  const { payer, payee } = await getParticipantContacts(e.aggregateId)

  // Determine who raised the dispute to show their name in the email
  const raiserParticipant = await db.escrowParticipant.findFirst({
    where:   { escrowId: e.aggregateId, userId: e.raisedById },
    include: { user: { select: { firstName: true, name: true } } },
  })
  const raisedByName =
    raiserParticipant?.user?.firstName ??
    raiserParticipant?.name ??
    'A participant'

  const recipients = [payer, payee].filter(Boolean) as { email: string; name: string }[]

  for (const recipient of recipients) {
    await sendEmail({
      to: recipient.email,
      ...escrowDisputedTemplate({
        recipientName: recipient.name,
        escrowTitle:   escrow.title,
        reason:        e.reason,
        raisedByName,
        code:          escrow.code,
      }),
    })
  }
  workerLog.warn({ escrowId: e.aggregateId }, 'escrow-disputed emails sent')
}

async function handleMilestoneSubmitted(event: DomainEvent) {
  const e = event as MilestoneSubmittedEvent

  const escrow = await db.escrow.findUnique({ where: { id: e.aggregateId } })
  if (!escrow) return

  const { payer, payee } = await getParticipantContacts(e.aggregateId)
  if (!payer || !payee) return

  await sendEmail({
    to: payer.email,
    ...milestoneSubmittedTemplate({
      payerName:      payer.name,
      milestoneTitle: e.milestoneTitle,
      escrowTitle:    escrow.title,
      code:           escrow.code,
      payeeName:      payee.name,
    }),
  })
  workerLog.info({ escrowId: e.aggregateId, milestoneId: e.milestoneId }, 'milestone-submitted email sent')
}

async function handleMilestoneApproved(event: DomainEvent) {
  const e = event as MilestoneApprovedEvent

  const [escrow, milestone] = await Promise.all([
    db.escrow.findUnique({ where: { id: e.aggregateId } }),
    db.milestone.findUnique({ where: { id: e.milestoneId } }),
  ])
  if (!escrow || !milestone) return

  const { payee } = await getParticipantContacts(e.aggregateId)
  if (!payee) return

  await sendEmail({
    to: payee.email,
    ...milestoneApprovedTemplate({
      payeeName:      payee.name,
      milestoneTitle: milestone.title,
      escrowTitle:    escrow.title,
      amount:         e.amount,
      currency:       e.currency,
      code:           escrow.code,
    }),
  })
  workerLog.info({ escrowId: e.aggregateId, milestoneId: e.milestoneId }, 'milestone-approved email sent')
}

// ── Worker ────────────────────────────────────────────────────────────────────

export function startNotificationsWorker(redis: Redis) {
  const worker = new Worker<DomainEvent>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      const event = job.data

      try {
        switch (event.eventType) {
          case 'user.registered':
            await handleUserRegistered(event)
            break

          case 'user.email_verified':
            await handleEmailVerified(event)
            break

          case 'escrow.created':
            await handleEscrowCreated(event)
            break

          case 'escrow.funded':
            await handleEscrowFunded(event)
            break

          case 'escrow.released':
            await handleEscrowReleased(event)
            break

          case 'escrow.disputed':
            await handleEscrowDisputed(event)
            break

          case 'milestone.submitted':
            await handleMilestoneSubmitted(event)
            break

          case 'milestone.approved':
            await handleMilestoneApproved(event)
            break

          default:
            workerLog.warn({ eventType: event.eventType }, 'unhandled notification event — skipped')
        }
      } catch (err) {
        workerLog.error(
          { eventType: event.eventType, aggregateId: event.aggregateId, err: (err as Error).message },
          'notification handler threw — job will be retried',
        )
        throw err
      }
    },
    { connection: redis },
  )

  worker.on('ready', () => {
    workerLog.info({ queue: QUEUE_NAMES.NOTIFICATIONS }, 'worker connected and listening')
  })

  worker.on('error', (err) => {
    workerLog.error({ err: err.message }, 'worker connection error')
  })

  worker.on('completed', (job) => {
    workerLog.info({ jobId: job.id, jobName: job.name }, 'job completed')
  })

  worker.on('failed', (job, err) => {
    workerLog.error({ jobId: job?.id, jobName: job?.name, err: err.message }, 'job failed')
  })

  return worker
}
