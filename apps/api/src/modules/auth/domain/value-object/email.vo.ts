import { ValueObject } from '../../../../shared/base/ValueObject'

interface EmailProps {
  value: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class Email extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super(props)
  }

  static create(raw: string): Email {
    const normalised = raw.trim().toLowerCase()
    if (!EMAIL_REGEX.test(normalised)) {
      throw new Error(`"${raw}" is not a valid email address`)
    }
    return new Email({ value: normalised })
  }

  get value(): string {
    return this.props.value
  }

  toString(): string {
    return this.props.value
  }
}
