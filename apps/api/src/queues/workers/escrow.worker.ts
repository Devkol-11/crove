import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'
import type { DomainEvent } from '../../shared/base/DomainEvent'
import { db } from '../../lib/prisma'
import { log } from '../../lib/logger'

const workerLog = log.worker.escrow

export const ESCROW_JOBS = {
  EXPIRE_ESCROW: 'escrow.expire',
} as const

interface ExpireEscrowPayload {
  escrowId: string
}

export function startEscrowWorker(redis: Redis) {
  const worker = new Worker<DomainEvent | ExpireEscrowPayload>(
    QUEUE_NAMES.ESCROW,
    async (job) => {
      // Internal jobs have a distinct name; domain events use their eventType as the job name
      if (job.name === ESCROW_JOBS.EXPIRE_ESCROW) {
        const { escrowId } = job.data as ExpireEscrowPayload
        const escrow = await db.escrow.findUnique({ where: { id: escrowId } })
        if (!escrow) return

        const cancellableStatuses = new Set(['Created', 'AwaitingPayment'])
        if (!cancellableStatuses.has(escrow.status)) return

        await db.escrow.update({
          where: { id: escrowId },
          data:  { status: 'Cancelled' },
        })
        workerLog.info({ escrowId, code: escrow.code }, 'escrow expired and cancelled')
        return
      }

      // Domain events
      const event = job.data as DomainEvent

      switch (event.eventType) {
        case 'escrow.created':
          workerLog.info({ aggregateId: event.aggregateId }, 'escrow created')
          break

        case 'escrow.funded':
          // TODO: schedule auto-release deadline job:
          //   await escrowQueue.add('escrow.expire', { escrowId }, { delay: ms('7d') })
          workerLog.info({ aggregateId: event.aggregateId }, 'escrow funded — auto-release timer pending')
          break

        case 'escrow.released':
          // TODO: trigger Paystack payout to the payee's bank account
          workerLog.info({ aggregateId: event.aggregateId }, 'escrow released — payout pending')
          break

        case 'escrow.disputed':
          // TODO: flag for admin review, freeze auto-release timer
          workerLog.warn({ aggregateId: event.aggregateId }, 'escrow disputed — flagged for review')
          break

        case 'milestone.submitted':
          // TODO: start payer-review deadline timer (e.g. auto-approve after 3 days)
          workerLog.info({ aggregateId: event.aggregateId }, 'milestone submitted — review timer pending')
          break

        case 'milestone.approved':
          // TODO: release milestone funds to payee
          workerLog.info({ aggregateId: event.aggregateId }, 'milestone approved — funds release pending')
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
