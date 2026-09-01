import type { User } from '@prisma/client'
import { Entity } from '../../../../shared/base/Entity'

// UserProfile wraps the Prisma User row and answers profile/display concerns:
// "What is this person's name?", "Do they have a phone number?", etc.
// AuthUser (auth module) answers identity/auth concerns for the same DB row.
export class UserProfile extends Entity<string> {
  private constructor(private readonly props: User) {
    super(props.id)
  }

  static from(data: User): UserProfile {
    return new UserProfile(data)
  }

  get email(): string   { return this.props.email }
  get firstName(): string | null { return this.props.firstName }
  get lastName(): string | null  { return this.props.lastName }
  get phone(): string | null     { return this.props.phone }
  get image(): string | null     { return this.props.image }

  // Prefers "FirstName LastName" if both are set, otherwise falls back to Better Auth's name field.
  getDisplayName(): string {
    if (this.props.firstName && this.props.lastName) {
      return `${this.props.firstName} ${this.props.lastName}`
    }
    if (this.props.firstName) return this.props.firstName
    return this.props.name
  }

  hasPhone(): boolean {
    return Boolean(this.props.phone)
  }

  hasCompletedProfile(): boolean {
    return Boolean(this.props.firstName && this.props.lastName && this.props.phone)
  }
}
