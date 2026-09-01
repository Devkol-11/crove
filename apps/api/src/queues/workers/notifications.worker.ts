import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'
import type { DomainEvent } from '../../shared/base/DomainEvent'

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Worker
//
// Receives every domain event that was dispatched to the notifications queue.
// Each case below is where you plug in an email/push provider (e.g. Resend).
//
// Job data shape: the full DomainEvent object.
// The worker uses event.eventType to route and event's extra fields for content.
// ─────────────────────────────────────────────────────────────────────────────

export function startNotificationsWorker(redis: Redis) {
  const worker = new Worker<DomainEvent>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      const event = job.data

      switch (event.eventType) {
        case 'user.registered':
          // TODO: send welcome email to new user
          console.log(`[notifications] Welcome email → user ${event.aggregateId}`)
          break

        case 'user.email_verified':
          // TODO: send "email confirmed" confirmation
          console.log(`[notifications] Email verified → user ${event.aggregateId}`)
          break

        case 'escrow.created':
          // TODO: notify creator their escrow is live and ready to share
          console.log(`[notifications] Escrow created → ${event.aggregateId}`)
          break

        case 'escrow.funded':
          // TODO: notify creator + seller that funds are now held
          console.log(`[notifications] Escrow funded → ${event.aggregateId}`)
          break

        case 'escrow.released':
          // TODO: notify seller that funds have been released
          console.log(`[notifications] Escrow released → ${event.aggregateId}`)
          break

        case 'escrow.disputed':
          // TODO: notify both parties a dispute has been opened
          console.log(`[notifications] Dispute raised → ${event.aggregateId}`)
          break

        case 'milestone.submitted':
          // TODO: notify buyer to review the submission
          console.log(`[notifications] Milestone submitted → ${event.aggregateId}`)
          break

        case 'milestone.approved':
          // TODO: notify seller their milestone was approved
          console.log(`[notifications] Milestone approved → ${event.aggregateId}`)
          break

        default:
          // Unknown event type — acknowledge without failing.
          // New event types added to the domain won't break the worker.
          console.log(`[notifications] Unhandled event type: ${event.eventType}`)
      }
    },
    { connection: redis },
  )

  worker.on('completed', (job) => {
    console.log(`[notifications] Job ${job.id} (${job.name}) completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[notifications] Job ${job?.id} (${job?.name}) failed: ${err.message}`)
  })

  return worker
}
