import type { DomainEvent } from '../../../../shared/base/DomainEvent'

export class UserRegisteredEvent implements DomainEvent {
  readonly eventType    = 'user.registered'
  readonly aggregateType = 'User'
  readonly occurredAt   = new Date()

  constructor(
    readonly aggregateId: string, // userId
    readonly email: string,
    readonly name: string,
  ) {}
}
