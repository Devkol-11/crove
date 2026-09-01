import type { DomainEvent } from '../../../../shared/base/DomainEvent'

export class EscrowFundedEvent implements DomainEvent {
  readonly eventType = 'escrow.funded'
  readonly aggregateType = 'Escrow'
  readonly occurredAt = new Date()

  constructor(
    readonly aggregateId: string, // escrowId
    readonly payerId: string,
    readonly amount: number,
    readonly currency: string,
  ) {}
}
