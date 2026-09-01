import type { User } from '@prisma/client'
import { Entity } from '../../../../shared/base/Entity'

export class AuthUser extends Entity<string> {
  private constructor(private readonly props: User) {
    super(props.id)
  }

  // Constructed from a Prisma User row — no separate repository needed.
  static from(data: User): AuthUser {
    return new AuthUser(data)
  }

  get email(): string {
    return this.props.email
  }

  get isEmailVerified(): boolean {
    return this.props.emailVerified
  }

  // The display name Better Auth tracks — could be full name or just email prefix.
  get name(): string {
    return this.props.name
  }

  // Business invariants
  canSignIn(): boolean {
    return this.props.emailVerified
  }
}
