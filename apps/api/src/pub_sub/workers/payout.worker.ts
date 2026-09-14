import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES, getQueues } from '../index'
import { db } from '../../lib/prisma'
import { log } from '../../lib/logger'
import { appendEscrowEvent } from '../../modules/escrow/domain/helpers/escrow-event.helper'
import { appendLedgerEntry } from '../../modules/escrow/domain/helpers/ledger.helper'
import { LedgerEntryType } from '../../modules/escrow/escrow.types'
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
  capabilityRetryCount?: number  // incremented each time we requeue waiting for capability
}

const MAX_CAPABILITY_RETRIES = 24 // 24 hourly retries = 1 day max wait

async function handleProcessPayout(payload: ProcessPayoutPayload) {
  const bachs = getBachsInstance()

  // Verify the payee's transfers capability is active before attempting.
  // If not active (e.g. requirements outstanding after account creation), requeue
  // with a 1-hour delay and give up after 24 attempts.
  const capabilities = await bachs.getAccountCapabilities(payload.payeeAccountId)
  const transfersCapability = capabilities.items.find((c) => c.name === 'transfers')
  const transfersActive = transfersCapability?.status === 'active'

  if (!transfersActive) {
    const retryCount = (payload.capabilityRetryCount ?? 0) + 1

    if (retryCount > MAX_CAPABILITY_RETRIES) {
      workerLog.error(
        { escrowId: payload.escrowId, accountId: payload.payeeAccountId, retryCount },
        'transfers capability not active after max retries — manual intervention required',
      )
      return
    }

    const { payoutQueue } = getQueues()
    // Fixed jobId ensures only one capability-retry is queued at a time per escrow/milestone
    const capRetryJobId = payload.milestoneId
      ? `payout-cap-retry-milestone-${payload.milestoneId}`
      : `payout-cap-retry-escrow-${payload.escrowId}`

    await payoutQueue?.add(
      PAYOUT_JOBS.PROCESS_PAYOUT,
      { ...payload, capabilityRetryCount: retryCount },
      { delay: 60 * 60 * 1000, jobId: capRetryJobId },
    )

    workerLog.warn(
      { escrowId: payload.escrowId, accountId: payload.payeeAccountId, retryCount, transfersStatus: transfersCapability?.status },
      'transfers capability not active — requeued in 1h',
    )
    return
  }

  const balance = await bachs.getPlatformBalance()

  if (balance.availableBalance >= payload.amount) {
    const idempotencyKey = payload.milestoneId
      ? `payout-milestone-${payload.milestoneId}`
      : `payout-escrow-${payload.escrowId}`

    const { transferId } = await bachs.createTransfer({
      amount: payload.amount,
      currency: payload.currency,
      destinationAccountId: payload.payeeAccountId,
      idempotencyKey,
      description: payload.milestoneId
        ? `Milestone payout — escrow ${payload.escrowId}`
        : `Release payout — escrow ${payload.escrowId}`,
      metadata: { crove_reference: payload.reference, escrow_id: payload.escrowId },
    })

    await appendEscrowEvent(db, payload.escrowId, 'PayoutInitiated', 'system', {
      transferId,
      reference:      payload.reference,
      payeeAccountId: payload.payeeAccountId,
      amount:         payload.amount,
      currency:       payload.currency,
      ...(payload.milestoneId ? { milestoneId: payload.milestoneId } : {}),
    })

    // Ledger entry for milestone payouts — standard release ledger entries are written
    // by releaseEscrow() in the service layer. Adding one here for milestone payouts
    // keeps the ledger accurate for partial milestone disbursements.
    if (payload.milestoneId) {
      await appendLedgerEntry(db, {
        escrowId:    payload.escrowId,
        type:        LedgerEntryType.Release,
        amount:      payload.amount,
        currency:    payload.currency,
        description: `Milestone payout — ref: ${payload.reference}`,
        reference:   `LDG-${payload.reference}`,
      })

      // Mark the milestone as Released and auto-close the escrow if all milestones are done
      await db.milestone.update({
        where: { id: payload.milestoneId },
        data:  { status: 'Released' },
      })

      const allMilestones = await db.milestone.findMany({
        where:  { escrowId: payload.escrowId },
        select: { status: true },
      })
      const allReleased = allMilestones.every((m) => m.status === 'Released')

      if (allReleased) {
        await db.escrow.updateMany({
          where: { id: payload.escrowId, status: 'Held' },
          data:  { status: 'Released', releasedAt: new Date() },
        })
        await appendEscrowEvent(db, payload.escrowId, 'StatusChangedToReleased', 'system', {
          reason: 'all milestones released',
        })
        workerLog.info({ escrowId: payload.escrowId }, 'all milestones released — escrow auto-closed')
      }
    }

    workerLog.info(
      { escrowId: payload.escrowId, transferId, amount: payload.amount },
      'payout transfer created',
    )
  } else {
    // Insufficient available balance — requeue for next expected settlement day (or 24h).
    // Fixed jobId ensures only one balance-retry is queued at a time per escrow/milestone.
    const next = balance.pendingSettlementsByDay[0]
    const delayMs = next
      ? Math.max(new Date(next.date).getTime() - Date.now() + 60_000, 60_000)
      : 24 * 60 * 60 * 1000

    const { payoutQueue } = getQueues()
    const balRetryJobId = payload.milestoneId
      ? `payout-bal-retry-milestone-${payload.milestoneId}`
      : `payout-bal-retry-escrow-${payload.escrowId}`

    await payoutQueue?.add(PAYOUT_JOBS.PROCESS_PAYOUT, payload, { delay: delayMs, jobId: balRetryJobId })

    workerLog.warn(
      {
        escrowId:  payload.escrowId,
        available: balance.availableBalance,
        required:  payload.amount,
        retryAt:   next?.date ?? '24h',
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
