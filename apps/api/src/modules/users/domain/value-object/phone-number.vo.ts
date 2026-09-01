import { ValueObject } from '../../../../shared/base/ValueObject'

interface PhoneNumberProps {
  value: string
}

const NG_LOCAL_REGEX = /^0[789][01]\d{8}$/
const E164_REGEX = /^\+234[789][01]\d{8}$/

export class PhoneNumber extends ValueObject<PhoneNumberProps> {
  private constructor(props: PhoneNumberProps) {
    super(props)
  }

  static create(raw: string): PhoneNumber {
    const cleaned = raw.replace(/\s+/g, '')

    if (NG_LOCAL_REGEX.test(cleaned)) {
      // Convert 080... → +23480...
      return new PhoneNumber({ value: `+234${cleaned.slice(1)}` })
    }

    if (E164_REGEX.test(cleaned)) {
      return new PhoneNumber({ value: cleaned })
    }

    throw new Error(`"${raw}" is not a valid Nigerian phone number`)
  }

  get value(): string {
    return this.props.value
  }

  toString(): string {
    return this.props.value
  }
}
