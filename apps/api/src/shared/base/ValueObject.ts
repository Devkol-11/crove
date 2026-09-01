// ValueObjects have no identity — they are defined entirely by their properties.
// Two Money objects with amount=100 and currency="NGN" are equal and interchangeable.
//
// Key rules:
//   - Immutable: props are frozen on construction.
//   - Self-validating: the constructor (or a static factory) throws on invalid input.
//   - Compared by value, not by reference.

export abstract class ValueObject<TProps extends Record<string, unknown>> {
  protected readonly props: Readonly<TProps>

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props })
  }

  equals(other: ValueObject<TProps>): boolean {
    if (other === null || other === undefined) return false
    if (this.constructor !== other.constructor) return false
    return JSON.stringify(this.props) === JSON.stringify(other.props)
  }
}
