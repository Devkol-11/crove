import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'
import type { DomainEvent } from '../../shared/base/DomainEvent'
import { log } from '../../lib/logger'

const workerLog = log.worker.notifications

export function startNotificationsWorker(redis: Redis) {
  const worker = new Worker<DomainEvent>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      const event = job.data

      switch (event.eventType) {
        case 'user.registered':
          // TODO: send welcome email to new user
          workerLog.info({ aggregateId: event.aggregateId }, 'welcome email queued')
          break

        case 'user.email_verified':
          // TODO: send "email confirmed" confirmation
          workerLog.info({ aggregateId: event.aggregateId }, 'email verified notification queued')
          break

        case 'escrow.created':
          // TODO: notify creator their escrow is live and ready to share
          workerLog.info({ aggregateId: event.aggregateId }, 'escrow created notification queued')
          break

        case 'escrow.funded':
          // TODO: notify creator + seller that funds are now held
          workerLog.info({ aggregateId: event.aggregateId }, 'escrow funded notification queued')
          break

        case 'escrow.released':
          // TODO: notify seller that funds have been released
          workerLog.info({ aggregateId: event.aggregateId }, 'escrow released notification queued')
          break

        case 'escrow.disputed':
          // TODO: notify both parties a dispute has been opened
          workerLog.warn({ aggregateId: event.aggregateId }, 'dispute opened notification queued')
          break

        case 'milestone.submitted':
          // TODO: notify buyer to review the submission
          workerLog.info({ aggregateId: event.aggregateId }, 'milestone submitted notification queued')
          break

        case 'milestone.approved':
          // TODO: notify seller their milestone was approved
          workerLog.info({ aggregateId: event.aggregateId }, 'milestone approved notification queued')
          break

        default:
          // Unknown event type — acknowledge without failing.
          // New event types added to the domain won't break the worker.
          workerLog.warn({ eventType: event.eventType }, 'unhandled event type — skipped')
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
