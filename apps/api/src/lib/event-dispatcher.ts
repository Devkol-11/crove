import type { DomainEvent } from '../shared/base/DomainEvent'
import { getQueues } from '../queues'

// ─────────────────────────────────────────────────────────────────────────────
// EventDispatcher
//
// The single seam between the domain layer and the outside world.
// Domain code (aggregates, services) calls dispatch() — it never knows whether
// the event goes to a queue, a webhook, a log, or nowhere.
// Infrastructure changes here without touching any domain file.
//
// Routing:
//   notificationsQueue — every event that may need to notify a user (email, push)
//   escrowQueue        — escrow-domain events that need business processing
//                        (e.g. schedule auto-release, trigger payout)
// ─────────────────────────────────────────────────────────────────────────────

// Escrow-domain event types that the escrow worker needs to act on.
// The notifications worker receives ALL events and decides what to send.
const ESCROW_WORKER_EVENTS = new Set([
  'escrow.created',
  'escrow.funded',
  'escrow.released',
  'escrow.disputed',
  'milestone.submitted',
  'milestone.approved',
])

class EventDispatcher {
  async dispatch(event: DomainEvent): Promise<void> {
    // Always log — visible in both dev and prod, useful for debugging.
    console.log(
      `[domain:event] ${event.eventType} | ${event.aggregateType}(${event.aggregateId}) | ${event.occurredAt.toISOString()}`,
    )

    // getQueues() reads the current values of the queue references.
    // They are undefined before createQueues() runs (very early in startup).
    // Any event fired after the server starts will find them populated.
    const { notificationsQueue, escrowQueue } = getQueues()

    // Every event goes to the notifications queue.
    // The worker decides which event types warrant an email / push notification.
    if (notificationsQueue) {
      await notificationsQueue.add(event.eventType, event)
    }

    // Escrow events also go to the escrow worker for domain-side processing
    // (scheduling deadlines, triggering payouts, etc.)
    if (escrowQueue && ESCROW_WORKER_EVENTS.has(event.eventType)) {
      await escrowQueue.add(event.eventType, event)
    }
  }

  // Dispatches a batch — collected from AggregateRoot.domainEvents after a command.
  async dispatchMany(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.dispatch(event)
    }
  }
}

// Singleton — the whole application shares one dispatcher.
// In tests: replace the implementation on this object or mock the queues.
export const eventDispatcher = new EventDispatcher()
