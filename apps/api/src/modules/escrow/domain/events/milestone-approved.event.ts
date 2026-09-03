import type { DomainEvent } from '../../../../shared/base/DomainEvent'

export class MilestoneApprovedEvent implements DomainEvent {
  readonly eventType = 'milestone.approved'
  readonly aggregateType = 'Escrow'
  readonly occurredAt = new Date()

  constructor(
    readonly aggregateId: string, // escrowId
    readonly milestoneId: string,
    readonly approvedByUserId: string,
    readonly amount: number,
    readonly currency: string,
  ) {}
}
