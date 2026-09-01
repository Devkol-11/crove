import type { PrismaClient } from '@prisma/client'
import { UserProfile } from './domain/entity/user-profile.entity'
import { PhoneNumber } from './domain/value-object/phone-number.vo'
import { ProfileUpdatedEvent } from './domain/events/profile-updated.event'
import { eventDispatcher } from '../../lib/event-dispatcher'
import type { UpdateProfileInput } from './users.schema'

export class UsersService {
  constructor(private readonly db: PrismaClient) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const data = await this.db.user.findUniqueOrThrow({ where: { id: userId } })
    return UserProfile.from(data)
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    const validatedPhone = input.phone !== undefined ? PhoneNumber.create(input.phone) : undefined

    const syncedName =
      input.firstName && input.lastName ? `${input.firstName} ${input.lastName}` : undefined

    const updated = await this.db.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName ?? undefined,
        lastName: input.lastName ?? undefined,
        phone: validatedPhone ? validatedPhone.value : undefined,
        ...(syncedName && { name: syncedName }),
      },
    })

    const profile = UserProfile.from(updated)

    const changedFields = (Object.keys(input) as Array<keyof UpdateProfileInput>).filter(
      (k) => input[k] !== undefined,
    )

    await eventDispatcher.dispatch(new ProfileUpdatedEvent(userId, changedFields))

    return profile
  }
}
