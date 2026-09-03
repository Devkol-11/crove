import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES, getQueues } from '../index'
import type { DomainEvent } from '../../shared/base/DomainEvent'
import type { EscrowFundedEvent } from '../../modules/escrow/domain/events/escrow-funded.event'
import type { MilestoneSubmittedEvent } from '../../modules/escrow/domain/events/milestone-submitted.event'
import { db } from '../../lib/prisma'
import { log } from '../../lib/logger'

const workerLog = log.worker.escrow

const DAY_MS = 24 * 60 * 60 * 1000

export const ESCROW_JOBS = {
  EXPIRE_ESCROW:             'escrow.expire',
  AUTO_RELEASE_ESCROW:       'escrow.auto_release',
  MILESTONE_REVIEW_TIMEOUT:  'milestone.review_timeout',
} as const

interface ExpireEscrowPayload        { escrowId: string }
interface AutoReleaseEscrowPayload   { escrowId: string }
interface MilestoneReviewPayload     { escrowId: string; milestoneId: string }

// ── Internal job handlers ─────────────────────────────────────────────────────

async function handleExpireEscrow({ escrowId }: ExpireEscrowPayload) {
  const escrow = await db.escrow.findUnique({ where: { id: escrowId } })
  if (!escrow) return

  const cancellableStatuses = new Set(['Created', 'AwaitingPayment'])
  if (!cancellableStatuses.has(escrow.status)) return

  await db.escrow.update({
    where: { id: escrowId },
    data:  { status: 'Cancelled' },
  })
  workerLog.info({ escrowId, code: escrow.code }, 'escrow expired and cancelled')
}

async function handleAutoReleaseEscrow({ escrowId }: AutoReleaseEscrowPayload) {
  const escrow = await db.escrow.findUnique({ where: { id: escrowId } })
  if (!escrow) return

  // Only auto-release if still in a held state — payer may have already released.
  // Funded is excluded: the payment worker atomically transitions Funded→Held in the
  // same DB transaction, so an escrow should never rest in Funded long enough to trigger
  // this handler. Including it here would create an invalid state transition.
  const releasableStatuses = new Set(['Held', 'AwaitingAction'])
  if (!releasableStatuses.has(escrow.status)) {
    workerLog.info({ escrowId, status: escrow.status }, 'auto-release skipped — escrow not in releasable state')
    return
  }

  // Do not auto-release a disputed escrow
  if (escrow.status === 'Disputed') {
    workerLog.info({ escrowId }, 'auto-release skipped — escrow is under dispute')
    return
  }

  await db.escrow.update({
    where: { id: escrowId },
    data:  { status: 'Released', releasedAt: new Date() },
  })
  workerLog.info({ escrowId, code: escrow.code }, 'escrow auto-released after deadline')
  // TODO: trigger Paystack payout to payee's bank account
}

async function handleMilestoneReviewTimeout({ escrowId, milestoneId }: MilestoneReviewPayload) {
  const milestone = await db.milestone.findUnique({ where: { id: milestoneId } })
  if (!milestone || milestone.escrowId !== escrowId) return

  // Only auto-approve if still awaiting payer review
  if (milestone.status !== 'Submitted') {
    workerLog.info({ milestoneId, status: milestone.status }, 'milestone review timeout skipped — not in Submitted state')
    return
  }

  await db.milestone.update({
    where: { id: milestoneId },
    data:  { status: 'Approved', approvedAt: new Date() },
  })
  workerLog.info({ milestoneId, escrowId }, 'milestone auto-approved after 3-day review timeout')
  // TODO: trigger partial Paystack payout for this milestone
}

// ── Domain event handlers ─────────────────────────────────────────────────────

async function handleEscrowFunded(event: DomainEvent) {
  const e = event as EscrowFundedEvent
  const { escrowQueue } = getQueues()

  // Schedule auto-release 7 days after funding if the payer hasn't released by then
  await escrowQueue?.add(
    ESCROW_JOBS.AUTO_RELEASE_ESCROW,
    { escrowId: e.aggregateId },
    {
      delay: 7 * DAY_MS,
      jobId: `auto-release:${e.aggregateId}`, // one job per escrow — deduped
    },
  )
  workerLog.info({ escrowId: e.aggregateId }, 'auto-release job scheduled (7 days)')
}

async function handleEscrowReleased(event: DomainEvent) {
  // Cancel the pending auto-release job — no longer needed
  const { escrowQueue } = getQueues()
  await escrowQueue?.remove(`auto-release:${event.aggregateId}`)
  workerLog.info({ escrowId: event.aggregateId }, 'auto-release job cancelled — escrow released manually')
  // TODO: trigger Paystack payout to payee's bank account
}

async function handleEscrowDisputed(event: DomainEvent) {
  // Cancel the auto-release timer — funds stay frozen during dispute
  const { escrowQueue } = getQueues()
  await escrowQueue?.remove(`auto-release:${event.aggregateId}`)
  workerLog.warn({ escrowId: event.aggregateId }, 'auto-release job cancelled — dispute opened, funds frozen')
}

async function handleMilestoneSubmitted(event: DomainEvent) {
  const e = event as MilestoneSubmittedEvent
  const { escrowQueue } = getQueues()

  // Auto-approve if the payer doesn't respond within 3 days
  await escrowQueue?.add(
    ESCROW_JOBS.MILESTONE_REVIEW_TIMEOUT,
    { escrowId: e.aggregateId, milestoneId: e.milestoneId },
    {
      delay: 3 * DAY_MS,
      jobId: `review-timeout:${e.milestoneId}`, // one job per milestone
    },
  )
  workerLog.info({ escrowId: e.aggregateId, milestoneId: e.milestoneId }, 'milestone review-timeout job scheduled (3 days)')
}

async function handleMilestoneApproved(event: DomainEvent) {
  // Cancel the review-timeout job — payer already approved
  const e = event as MilestoneSubmittedEvent
  const { escrowQueue } = getQueues()
  await escrowQueue?.remove(`review-timeout:${e.milestoneId}`)
  workerLog.info({ milestoneId: e.milestoneId }, 'review-timeout job cancelled — milestone approved')
  // TODO: trigger partial Paystack payout for this milestone
}

// ── Worker ────────────────────────────────────────────────────────────────────

export function startEscrowWorker(redis: Redis) {
  const worker = new Worker<DomainEvent | ExpireEscrowPayload | AutoReleaseEscrowPayload | MilestoneReviewPayload>(
    QUEUE_NAMES.ESCROW,
    async (job) => {
      // Internal timer jobs — dispatched by this same worker
      if (job.name === ESCROW_JOBS.EXPIRE_ESCROW) {
        return handleExpireEscrow(job.data as ExpireEscrowPayload)
      }
      if (job.name === ESCROW_JOBS.AUTO_RELEASE_ESCROW) {
        return handleAutoReleaseEscrow(job.data as AutoReleaseEscrowPayload)
      }
      if (job.name === ESCROW_JOBS.MILESTONE_REVIEW_TIMEOUT) {
        return handleMilestoneReviewTimeout(job.data as MilestoneReviewPayload)
      }

      // Domain events routed here by the event dispatcher
      const event = job.data as DomainEvent

      switch (event.eventType) {
        case 'escrow.created':
          workerLog.info({ aggregateId: event.aggregateId }, 'escrow created — no timer needed at this stage')
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
          workerLog.warn({ jobName: job.name }, 'unhandled escrow job — skipped')
      }
    },
    { connection: redis },
  )

  worker.on('ready', () => {
    workerLog.info({ queue: QUEUE_NAMES.ESCROW }, 'worker connected and listening')
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
