import { DomainValidationError } from '../../../../shared/domain/domain.error'

export class PhoneNumberFormatError extends DomainValidationError {
  readonly code = 'PHONE_NUMBER_FORMAT'
}
