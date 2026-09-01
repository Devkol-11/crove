import type { DomainEvent } from '../../../../shared/base/DomainEvent'

export class ProfileUpdatedEvent implements DomainEvent {
  readonly eventType     = 'users.profile_updated'
  readonly aggregateType = 'User'
  readonly occurredAt    = new Date()

  constructor(
    readonly aggregateId: string, // userId
    readonly changedFields: string[], // e.g. ["firstName", "phone"]
  ) {}
}
