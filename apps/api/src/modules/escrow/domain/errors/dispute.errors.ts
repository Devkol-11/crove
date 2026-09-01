import { DomainValidationError, DomainAuthorizationError } from '../../../../shared/domain/domain.error'

export class DisputeInvalidTransitionError extends DomainValidationError {
  readonly code = 'DISPUTE_INVALID_TRANSITION'
}

export class DisputeOwnershipError extends DomainAuthorizationError {
  readonly code = 'DISPUTE_OWNERSHIP'
}
