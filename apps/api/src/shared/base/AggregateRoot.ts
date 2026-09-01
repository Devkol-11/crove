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

  clearDomainEvents(): void {
    this._domainEvents = []
  }
}
