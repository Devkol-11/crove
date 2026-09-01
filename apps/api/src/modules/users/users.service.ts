import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { UserProfile } from './domain/entity/user-profile.entity'
import { PhoneNumber } from './domain/value-object/phone-number.vo'
import { ProfileUpdatedEvent } from './domain/events/profile-updated.event'
import { eventDispatcher } from '../../lib/event-dispatcher'
import { withDbErrorHandler } from '../../lib/db.error.handler'
import { mapDomainError } from '../../lib/domain.error.mapper'
import type { UpdateProfileInput } from './users.schema'

export interface ProfileDto {
  id:                  string
  email:               string
  displayName:         string
  firstName:           string | null
  lastName:            string | null
  phone:               string | null
  image:               string | null
  hasCompletedProfile: boolean
}

function toDto(profile: UserProfile): ProfileDto {
  return {
    id:                  profile.id,
    email:               profile.email,
    displayName:         profile.getDisplayName(),
    firstName:           profile.firstName,
    lastName:            profile.lastName,
    phone:               profile.phone,
    image:               profile.image,
    hasCompletedProfile: profile.hasCompletedProfile(),
  }
}

export class UsersService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  async getProfile(userId: string): Promise<ProfileDto> {
    const data = await withDbErrorHandler(
      () => this.db.user.findUniqueOrThrow({ where: { id: userId } }),
      this.app,
    )
    return toDto(UserProfile.from(data))
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
    let validatedPhone: PhoneNumber | undefined
    if (input.phone !== undefined) {
      try {
        validatedPhone = PhoneNumber.create(input.phone)
      } catch (err) {
        throw mapDomainError(err, this.app)
      }
    }

    const syncedName =
      input.firstName && input.lastName
        ? `${input.firstName} ${input.lastName}`
        : undefined

    const updated = await withDbErrorHandler(
      () =>
        this.db.user.update({
          where: { id: userId },
          data: {
            firstName: input.firstName ?? undefined,
            lastName:  input.lastName  ?? undefined,
            phone:     validatedPhone  ? validatedPhone.value : undefined,
            ...(syncedName && { name: syncedName }),
          },
        }),
      this.app,
    )

    const profile = UserProfile.from(updated)

    const changedFields = (Object.keys(input) as Array<keyof UpdateProfileInput>).filter(
      (k) => input[k] !== undefined,
    )

    await eventDispatcher.dispatch(new ProfileUpdatedEvent(userId, changedFields))

    return toDto(profile)
  }
}
