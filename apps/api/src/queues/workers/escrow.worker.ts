import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'
import type { DomainEvent } from '../../shared/base/DomainEvent'

// ─────────────────────────────────────────────────────────────────────────────
// Escrow Worker
//
// Handles the business-processing side of escrow domain events — things that
// happen asynchronously after a state change (scheduling, payouts, etc.).
// Notification emails are handled separately by the notifications worker.
//
// Job data shape: the full DomainEvent object.
// ─────────────────────────────────────────────────────────────────────────────

export function startEscrowWorker(redis: Redis) {
  const worker = new Worker<DomainEvent>(
    QUEUE_NAMES.ESCROW,
    async (job) => {
      const event = job.data

      switch (event.eventType) {
        case 'escrow.created':
          // Placeholder — initial post-create business logic goes here
          // e.g. set an expiry timer if the escrow isn't funded within 48 hours
          console.log(`[escrow:worker] escrow.created → ${event.aggregateId}`)
          break

        case 'escrow.funded':
          // TODO: schedule an auto-release deadline job via BullMQ delayed jobs:
          //   await escrowQueue.add('escrow.auto_release', { escrowId }, { delay: ms('7d') })
          console.log(`[escrow:worker] escrow.funded → ${event.aggregateId}`)
          break

        case 'escrow.released':
          // TODO: trigger Paystack payout to the seller's bank account
          console.log(`[escrow:worker] escrow.released → ${event.aggregateId}`)
          break

        case 'escrow.disputed':
          // TODO: flag the escrow for admin review, freeze auto-release timer
          console.log(`[escrow:worker] escrow.disputed → ${event.aggregateId}`)
          break

        case 'milestone.submitted':
          // TODO: start buyer-review deadline timer (e.g. auto-approve after 3 days)
          console.log(`[escrow:worker] milestone.submitted → ${event.aggregateId}`)
          break

        case 'milestone.approved':
          // TODO: release milestone funds to seller
          console.log(`[escrow:worker] milestone.approved → ${event.aggregateId}`)
          break

        default:
          console.log(`[escrow:worker] Unhandled event type: ${event.eventType}`)
      }
    },
    { connection: redis },
  )

  worker.on('completed', (job) => {
    console.log(`[escrow:worker] Job ${job.id} (${job.name}) completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[escrow:worker] Job ${job?.id} (${job?.name}) failed: ${err.message}`)
  })

  return worker
}
