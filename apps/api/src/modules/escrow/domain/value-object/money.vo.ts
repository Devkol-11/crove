import { ValueObject } from '../../../../shared/base/ValueObject'

interface MoneyProps {
  amount: number // always stored as a positive number
  currency: string // ISO 4217, e.g. "NGN"
}

// Money is the most important value object in Crove.
// Invariant: amount must be >= 0. Currency must be a non-empty string.
// All arithmetic returns a new Money instance — Money is immutable.
export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props)
  }

  static of(amount: number, currency: string): Money {
    if (amount < 0) throw new Error(`Money amount cannot be negative (got ${amount})`)
    if (!currency || currency.trim().length === 0) throw new Error('Currency is required')
    return new Money({ amount, currency: currency.trim().toUpperCase() })
  }

  static zero(currency = 'NGN'): Money {
    return new Money({ amount: 0, currency })
  }

  get amount(): number {
    return this.props.amount
  }
  get currency(): string {
    return this.props.currency
  }

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return Money.of(this.amount + other.amount, this.currency)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    const result = this.amount - other.amount
    if (result < 0)
      throw new Error(
        `Cannot subtract ${other.amount} from ${this.amount} — result would be negative`,
      )
    return Money.of(result, this.currency)
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other)
    return this.amount > other.amount
  }

  isZero(): boolean {
    return this.amount === 0
  }

  toString(): string {
    return `${this.currency} ${this.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`)
    }
  }
}
