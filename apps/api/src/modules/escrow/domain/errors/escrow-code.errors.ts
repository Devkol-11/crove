import { DomainValidationError } from '../../../../shared/domain/domain.error'

export class EscrowCodeFormatError extends DomainValidationError {
  readonly code = 'ESCROW_CODE_FORMAT'
}
