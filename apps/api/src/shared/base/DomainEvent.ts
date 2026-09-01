export interface DomainEvent {
  readonly eventType: string // e.g. "escrow.funded"
  readonly aggregateId: string // ID of the aggregate that raised this event
  readonly aggregateType: string // e.g. "Escrow", "User"
  readonly occurredAt: Date
}
