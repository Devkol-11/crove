// A domain event represents something significant that happened in the domain.
// Events are facts — they're named in past tense and are immutable once created.
// Aggregates collect events; infrastructure dispatches them after the transaction commits.

export interface DomainEvent {
  readonly eventType: string       // e.g. "escrow.funded"
  readonly aggregateId: string     // ID of the aggregate that raised this event
  readonly aggregateType: string   // e.g. "Escrow", "User"
  readonly occurredAt: Date
}
