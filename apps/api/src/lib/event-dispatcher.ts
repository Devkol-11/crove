import type { DomainEvent } from '../shared/base/DomainEvent'
import { getQueues } from '../queues'
import { log } from './logger'

const ESCROW_WORKER_EVENTS = new Set([
  'escrow.created',
  'escrow.funded',
  'escrow.released',
  'escrow.disputed',
  'milestone.submitted',
  'milestone.approved',
])

const NOTIFICATION_WORKER_EVENTS = new Set([
  'user.registered',
  'user.email_verified',
  'escrow.created',
  'escrow.funded',
  'escrow.released',
  'escrow.disputed',
  'milestone.submitted',
  'milestone.approved',
])

class EventDispatcher {
  async dispatch(event: DomainEvent): Promise<void> {
    log.events.info(
      {
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
      },
      'dispatching domain event',
    )

    const { notificationsQueue, escrowQueue } = getQueues()

    if (notificationsQueue && NOTIFICATION_WORKER_EVENTS.has(event.eventType)) {
      await notificationsQueue.add(event.eventType, event)
    }

    if (escrowQueue && ESCROW_WORKER_EVENTS.has(event.eventType)) {
      await escrowQueue.add(event.eventType, event)
    }
  }

  async dispatchMany(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.dispatch(event)
    }
  }
}

// Singleton — the whole application shares one dispatcher.
// In tests: replace the implementation on this object or mock the queues.
export const eventDispatcher = new EventDispatcher()
