import { DomainValidationError } from '../../../../shared/domain/domain.error'

export class EscrowInvalidTransitionError extends DomainValidationError {
  readonly code = 'ESCROW_INVALID_TRANSITION'
}

export class EscrowUnsupportedCurrencyError extends DomainValidationError {
  readonly code = 'ESCROW_UNSUPPORTED_CURRENCY'
}

export class MilestoneDeadlinePastError extends DomainValidationError {
  readonly code = 'MILESTONE_DEADLINE_PAST'
}

export class MilestoneTotalExceedsLimitError extends DomainValidationError {
  readonly code = 'MILESTONE_TOTAL_EXCEEDS_LIMIT'
}
