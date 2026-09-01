import type { DomainEvent } from '../../../../shared/base/DomainEvent'

export class EscrowReleasedEvent implements DomainEvent {
  readonly eventType = 'escrow.released'
  readonly aggregateType = 'Escrow'
  readonly occurredAt = new Date()

  constructor(
    readonly aggregateId: string, // escrowId
    readonly releasedByUserId: string,
    readonly amount: number,
    readonly currency: string,
  ) {}
}
