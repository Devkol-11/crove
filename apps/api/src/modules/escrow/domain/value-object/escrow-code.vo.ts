import { ValueObject } from '../../../../shared/base/ValueObject'

interface EscrowCodeProps {
  value: string
}

const CODE_REGEX = /^[A-Z0-9]{6}$/

// The short alphanumeric code that powers the payment link: crove.app/e/8F72KD
// Invariant: exactly 6 uppercase alphanumeric characters.
export class EscrowCode extends ValueObject<EscrowCodeProps> {
  private constructor(props: EscrowCodeProps) {
    super(props)
  }

  static create(raw: string): EscrowCode {
    const normalised = raw.trim().toUpperCase()
    if (!CODE_REGEX.test(normalised)) {
      throw new Error(
        `"${raw}" is not a valid escrow code — must be 6 uppercase alphanumeric characters`,
      )
    }
    return new EscrowCode({ value: normalised })
  }

  get value(): string {
    return this.props.value
  }

  toPaymentLink(baseUrl = 'https://crove.app'): string {
    return `${baseUrl}/e/${this.props.value}`
  }

  toString(): string {
    return this.props.value
  }
}
