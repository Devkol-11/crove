import { DomainValidationError } from '../../../../shared/domain/domain.error'

export class UserIdEmptyError extends DomainValidationError {
  readonly code = 'USER_ID_EMPTY'
}

export class EmailFormatError extends DomainValidationError {
  readonly code = 'EMAIL_FORMAT'
}
