import { DomainValidationError } from '../../../../shared/domain/domain.error'

export class MoneyNegativeAmountError extends DomainValidationError {
  readonly code = 'MONEY_NEGATIVE_AMOUNT'
}

export class MoneyMissingCurrencyError extends DomainValidationError {
  readonly code = 'MONEY_MISSING_CURRENCY'
}

export class MoneySubtractionUnderflowError extends DomainValidationError {
  readonly code = 'MONEY_SUBTRACTION_UNDERFLOW'
}

export class MoneyCurrencyMismatchError extends DomainValidationError {
  readonly code = 'MONEY_CURRENCY_MISMATCH'
}
