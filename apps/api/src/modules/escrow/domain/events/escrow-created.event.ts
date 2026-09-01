import type { DomainEvent } from '../../../../shared/base/DomainEvent'
import type { EscrowType } from '../../escrow.types'

export class EscrowCreatedEvent implements DomainEvent {
  readonly eventType = 'escrow.created'
  readonly aggregateType = 'Escrow'
  readonly occurredAt = new Date()

  constructor(
    readonly aggregateId: string, // escrowId
    readonly creatorId: string,
    readonly escrowType: EscrowType,
    readonly amount: number,
    readonly currency: string,
    readonly code: string,
  ) {}
}
