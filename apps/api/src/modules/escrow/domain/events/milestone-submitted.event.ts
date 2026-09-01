import type { DomainEvent } from '../../../../shared/base/DomainEvent'

export class MilestoneSubmittedEvent implements DomainEvent {
  readonly eventType = 'escrow.milestone_submitted'
  readonly aggregateType = 'Escrow'
  readonly occurredAt = new Date()

  constructor(
    readonly aggregateId: string, // escrowId
    readonly milestoneId: string,
    readonly submittedByUserId: string,
    readonly milestoneTitle: string,
  ) {}
}
