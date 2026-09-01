import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'
import type { DomainEvent } from '../../shared/base/DomainEvent'
import { log } from '../../lib/logger'

const workerLog = log.worker.escrow

export function startEscrowWorker(redis: Redis) {
  const worker = new Worker<DomainEvent>(
    QUEUE_NAMES.ESCROW,
    async (job) => {
      const event = job.data

      switch (event.eventType) {
        case 'escrow.created':
          // TODO: set an expiry timer if the escrow isn't funded within 48 hours
          workerLog.info(
            { aggregateId: event.aggregateId },
            'escrow created — post-create checks pending',
          )
          break

        case 'escrow.funded':
          // TODO: schedule an auto-release deadline job via BullMQ delayed jobs:
          //   await escrowQueue.add('escrow.auto_release', { escrowId }, { delay: ms('7d') })
          workerLog.info(
            { aggregateId: event.aggregateId },
            'escrow funded — auto-release timer pending',
          )
          break

        case 'escrow.released':
          // TODO: trigger Paystack payout to the seller's bank account
          workerLog.info({ aggregateId: event.aggregateId }, 'escrow released — payout pending')
          break

        case 'escrow.disputed':
          // TODO: flag for admin review, freeze auto-release timer
          workerLog.warn({ aggregateId: event.aggregateId }, 'escrow disputed — flagged for review')
          break

        case 'milestone.submitted':
          // TODO: start buyer-review deadline timer (e.g. auto-approve after 3 days)
          workerLog.info(
            { aggregateId: event.aggregateId },
            'milestone submitted — review timer pending',
          )
          break

        case 'milestone.approved':
          // TODO: release milestone funds to seller
          workerLog.info(
            { aggregateId: event.aggregateId },
            'milestone approved — funds release pending',
          )
          break

        default:
          workerLog.warn({ eventType: event.eventType }, 'unhandled event type — skipped')
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
