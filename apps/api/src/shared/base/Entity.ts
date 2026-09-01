export abstract class Entity<TId = string> {
  protected readonly _id: TId

  protected constructor(id: TId) {
    this._id = id
  }

  get id(): TId {
    return this._id
  }

  equals(other: Entity<TId>): boolean {
    if (other === null || other === undefined) return false
    if (!(other instanceof Entity)) return false
    if (this.constructor !== other.constructor) return false
    return this._id === other._id
  }
}
