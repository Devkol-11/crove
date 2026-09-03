import type { DomainEvent } from '../../../../shared/base/DomainEvent'

export class EscrowDisputedEvent implements DomainEvent {
  readonly eventType    = 'escrow.disputed'
  readonly aggregateType = 'Escrow'
  readonly occurredAt   = new Date()

  constructor(
    readonly aggregateId: string, // escrowId
    readonly raisedById:  string,
    readonly reason:      string,
  ) {}
}
