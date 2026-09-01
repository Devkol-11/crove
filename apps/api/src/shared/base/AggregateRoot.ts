// AggregateRoot extends Entity with the ability to collect domain events.
//
// An aggregate root is the top-level entity of a cluster of related objects.
// Only aggregate roots are loaded from and saved to the DB directly.
// Child entities (e.g. Milestone inside Escrow) are accessed through the root.
//
// Domain events are added inside business methods and dispatched AFTER
// the database transaction commits — ensuring events only fire for persisted changes.
// Currently events are collected here; dispatch will be wired into the service layer
// when the first subscriber (e.g. the notifications queue) is ready.

import { Entity } from './Entity'
import type { DomainEvent } from './DomainEvent'

export abstract class AggregateRoot<TId = string> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = []

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event)
  }

  // Called by the service layer after events have been dispatched to the queue.
  clearDomainEvents(): void {
    this._domainEvents = []
  }
}
