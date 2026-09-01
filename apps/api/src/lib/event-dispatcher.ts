import type { DomainEvent } from '../shared/base/DomainEvent'

// The EventDispatcher is the seam between the domain layer and the outside world.
//
// Today it logs. When the notifications pipeline is ready, the single dispatch()
// method gets replaced with a BullMQ queue.add() call — no domain code changes.
// The domain only ever calls eventDispatcher.dispatch(event); it never knows
// whether the event goes to a queue, a webhook, or a log file.
//
// This is the "ports and adapters" principle applied to event publishing.

class EventDispatcher {
  async dispatch(event: DomainEvent): Promise<void> {
    // TODO: Replace the log below with:
    //   await notificationsQueue.add(event.eventType, event)
    //   await escrowQueue.add(event.eventType, event)
    // Both queues will be injected or imported once we wire the workers.
    console.log(
      `[domain:event] ${event.eventType} | ${event.aggregateType}(${event.aggregateId}) | ${event.occurredAt.toISOString()}`,
    )
  }

  // Dispatches a batch — collected from AggregateRoot.domainEvents
  async dispatchMany(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.dispatch(event)
    }
  }
}

// Exported as a singleton — the whole application shares one dispatcher.
// If you need to mock it in tests, swap the implementation on this object.
export const eventDispatcher = new EventDispatcher()
