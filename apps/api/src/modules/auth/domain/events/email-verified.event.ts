import type { DomainEvent } from '../../../../shared/base/DomainEvent'

export class EmailVerifiedEvent implements DomainEvent {
  readonly eventType     = 'auth.email_verified'
  readonly aggregateType = 'User'
  readonly occurredAt    = new Date()

  constructor(
    readonly aggregateId: string, // userId
    readonly email: string,
  ) {}
}
