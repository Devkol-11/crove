import { ValueObject } from '../../../../shared/base/ValueObject'
import { UserIdEmptyError } from '../errors/auth.errors'

interface UserIdProps {
  value: string
}

// Typed wrapper around a raw user ID string.
// Prevents mixing up userId with escrowId or milestoneId at the type level.
export class UserId extends ValueObject<UserIdProps> {
  private constructor(props: UserIdProps) {
    super(props)
  }

  static create(value: string): UserId {
    if (!value || value.trim().length === 0) {
      throw new UserIdEmptyError('UserId cannot be empty')
    }
    return new UserId({ value: value.trim() })
  }

  get value(): string {
    return this.props.value
  }

  toString(): string {
    return this.props.value
  }
}
