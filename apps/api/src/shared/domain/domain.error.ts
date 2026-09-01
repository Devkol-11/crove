export abstract class DomainError extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name

    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// Thrown when a domain invariant or business rule is violated → maps to 400
export abstract class DomainValidationError extends DomainError {}

// Thrown when an action is forbidden by domain policy → maps to 403
export abstract class DomainAuthorizationError extends DomainError {}
