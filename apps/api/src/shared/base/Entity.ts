// WHY a Base Entity class?
//
// In DDD, entities are defined by their IDENTITY, not their attributes.
// Two User objects with the same id are the same entity even if their name differs.
// Two User objects with different ids are different entities even if every field matches.
//
// The base class enforces this in three ways:
//   1. Centralises the id property so every entity always has one.
//   2. Provides an equals() method that compares by id — preventing accidental
//      reference equality checks (===) which would always return false for separate
//      objects loaded from the DB.
//   3. Gives you a clear seam to add cross-cutting concerns later
//      (e.g. audit timestamps, soft-delete flags) without touching every entity.

export abstract class Entity<TId = string> {
  protected readonly _id: TId

  protected constructor(id: TId) {
    this._id = id
  }

  get id(): TId {
    return this._id
  }

  // True if both entities have the same runtime type AND the same id.
  equals(other: Entity<TId>): boolean {
    if (other === null || other === undefined) return false
    if (!(other instanceof Entity)) return false
    if (this.constructor !== other.constructor) return false
    return this._id === other._id
  }
}
