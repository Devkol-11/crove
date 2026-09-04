import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES, getQueues } from '../index'
import { db } from '../../lib/prisma'
import { log } from '../../lib/logger'
import { appendEscrowEvent } from '../../modules/escrow/domain/helpers/escrow-event.helper'
import { getBachsInstance } from '../../third_party/payment_providers'

const workerLog = log.worker.payout

export const PAYOUT_JOBS = {
  PROCESS_PAYOUT: 'payout.process',
} as const

export interface ProcessPayoutPayload {
  escrowId: string
  payeeAccountId: string  // Bachs Connect acct_xxx
  amount: number          // decimal amount (e.g. 150000 for ₦150,000)
  currency: string
  reference: string       // unique per payout attempt — used for Idempotency-Key dedup
  milestoneId?: string    // set for partial milestone payouts
}

async function handleProcessPayout(payload: ProcessPayoutPayload) {
  const bachs = getBachsInstance()
  const balance = await bachs.getPlatformBalance()

  if (balance.availableBalance >= payload.amount) {
    const idempotencyKey = payload.milestoneId
      ? `payout-milestone-${payload.milestoneId}`
      : `payout-escrow-${payload.escrowId}`

    const { transferId } = await bachs.createTransfer({
      amount:              payload.amount,
      currency:            payload.currency,
      destinationAccountId: payload.payeeAccountId,
      reference:           payload.reference,
      idempotencyKey,
      description: payload.milestoneId
        ? `Milestone payout — escrow ${payload.escrowId}`
        : `Release payout — escrow ${payload.escrowId}`,
    })

    await appendEscrowEvent(db, payload.escrowId, 'PayoutInitiated', 'system', {
      transferId,
      payeeAccountId: payload.payeeAccountId,
      amount: payload.amount,
      currency: payload.currency,
      ...(payload.milestoneId ? { milestoneId: payload.milestoneId } : {}),
    })

    workerLog.info(
      { escrowId: payload.escrowId, transferId, amount: payload.amount },
      'payout transfer created',
    )
  } else {
    // Insufficient available balance — requeue for next expected settlement day (or 24h)
    const next = balance.pendingSettlementsByDay[0]
    const delayMs = next
      ? Math.max(new Date(next.date).getTime() - Date.now() + 60_000, 60_000)
      : 24 * 60 * 60 * 1000

    const { payoutQueue } = getQueues()
    await payoutQueue?.add(PAYOUT_JOBS.PROCESS_PAYOUT, payload, { delay: delayMs })

    workerLog.warn(
      {
        escrowId: payload.escrowId,
        available: balance.availableBalance,
        required: payload.amount,
        retryAt: next?.date ?? '24h',
      },
      'insufficient platform balance — payout requeued',
    )
  }
}

export function startPayoutWorker(redis: Redis) {
  const worker = new Worker<ProcessPayoutPayload>(
    QUEUE_NAMES.PAYOUT,
    async (job) => {
      if (job.name === PAYOUT_JOBS.PROCESS_PAYOUT) {
        return handleProcessPayout(job.data)
      }
      workerLog.warn({ jobName: job.name }, 'unhandled payout job — skipped')
    },
    { connection: redis },
  )

  worker.on('ready',     ()         => workerLog.info({ queue: QUEUE_NAMES.PAYOUT }, 'worker connected and listening'))
  worker.on('error',     (err)      => workerLog.error({ err: err.message }, 'worker connection error'))
  worker.on('completed', (job)      => workerLog.info({ jobId: job.id, jobName: job.name }, 'job completed'))
  worker.on('failed',    (job, err) => workerLog.error({ jobId: job?.id, jobName: job?.name, err: err.message }, 'job failed'))

  return worker
}
