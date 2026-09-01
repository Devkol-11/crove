import type { PrismaClient } from '@prisma/client'
import { UserProfile } from './domain/entity/user-profile.entity'
import { PhoneNumber } from './domain/value-object/phone-number.vo'
import { ProfileUpdatedEvent } from './domain/events/profile-updated.event'
import { eventDispatcher } from '../../lib/event-dispatcher'
import type { UpdateProfileInput } from './users.schema'

export class UsersService {
  constructor(private readonly db: PrismaClient) {}

  // Returns a domain entity, not raw Prisma data.
  // The controller calls entity methods (getDisplayName, hasCompletedProfile)
  // to build the response — business questions live on the entity, not the controller.
  async getProfile(userId: string): Promise<UserProfile> {
    const data = await this.db.user.findUniqueOrThrow({ where: { id: userId } })
    return UserProfile.from(data)
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    // ── Value Object validation (boundary enforcement) ───────────────────
    //
    // PhoneNumber.create() validates the format and normalises to E.164
    // BEFORE we touch the DB. If it throws, we return a 400 immediately —
    // no half-written rows, no need to clean up.
    //
    // This is the key value of Value Objects: they enforce invariants at
    // construction time, so invalid data can never enter the domain.
    const validatedPhone = input.phone !== undefined
      ? PhoneNumber.create(input.phone)
      : undefined

    // Keep Better Auth's name field in sync with firstName + lastName.
    // If only one name is provided, we don't update name (partial update).
    const syncedName =
      input.firstName && input.lastName
        ? `${input.firstName} ${input.lastName}`
        : undefined

    // ── Persist ──────────────────────────────────────────────────────────
    //
    // undefined fields are stripped by Prisma — they don't overwrite existing values.
    // null would clear a field; undefined skips it. We use undefined here
    // so a partial PATCH only changes what was sent.
    const updated = await this.db.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName ?? undefined,
        lastName:  input.lastName  ?? undefined,
        // Use the E.164-normalised value from the VO, not the raw input string.
        phone:     validatedPhone ? validatedPhone.value : undefined,
        ...(syncedName && { name: syncedName }),
      },
    })

    // ── Construct entity from updated DB row ─────────────────────────────
    //
    // We always re-wrap the Prisma result rather than mutating the old entity.
    // Entities are constructed from DB state — they're never mutated in memory.
    const profile = UserProfile.from(updated)

    // ── Raise and dispatch domain event ──────────────────────────────────
    //
    // We build the event AFTER the DB write. If the write failed, we never
    // reach this line, so no false event fires.
    const changedFields = (Object.keys(input) as Array<keyof UpdateProfileInput>)
      .filter((k) => input[k] !== undefined)

    await eventDispatcher.dispatch(new ProfileUpdatedEvent(userId, changedFields))

    return profile
  }
}
