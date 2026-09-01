import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'
import type Redis from 'ioredis'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../lib/auth'
import { db } from '../lib/prisma'
import { AuthUser } from '../modules/auth/domain/entity/auth-user.entity'
import { UserProfile } from '../modules/users/domain/entity/user-profile.entity'
import { log } from '../lib/logger'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    authUser: AuthUser | null
    userProfile: UserProfile | null
  }
}

const authLog = log.auth

const USER_CACHE_TTL_SECONDS = 5 * 60 // 5 minutes

function userCacheKey(userId: string): string {
  return `crove:user:${userId}`
}

// Reconstructs Date fields lost during JSON serialisation round-trip.
function hydrateUser(raw: Record<string, unknown>): User {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
  } as User
}

async function getCachedUser(redis: Redis, userId: string): Promise<User | null> {
  const raw = await redis.get(userCacheKey(userId))
  if (!raw) return null
  return hydrateUser(JSON.parse(raw) as Record<string, unknown>)
}

async function setCachedUser(redis: Redis, user: User): Promise<void> {
  await redis.set(userCacheKey(user.id), JSON.stringify(user), 'EX', USER_CACHE_TTL_SECONDS)
}

// Called by UsersService after a profile update so the next request
// always reflects the latest data rather than serving a 5-minute-stale cache.
export async function invalidateUserCache(redis: Redis, userId: string): Promise<void> {
  await redis.del(userCacheKey(userId))
  authLog.info({ userId }, 'user cache invalidated')
}

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('authUser', null)
  app.decorateRequest('userProfile', null)

  app.decorate(
    'authenticate',
    async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      // Step 1: validate the session token (Better Auth handles cookie/header parsing).
      // With cookieCache enabled in auth.ts, this skips the DB sessions table for
      // requests within the 5-minute client-side cache window.
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      })

      if (!session?.user) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'You must be signed in to access this resource',
        })
      }

      const userId = session.user.id

      // Step 2: look up the full user row — Redis first, DB on miss.
      // This avoids a DB round-trip on the majority of authenticated requests.
      let prismaUser = await getCachedUser(app.redis, userId)

      if (prismaUser) {
        authLog.info({ userId }, 'user cache hit')
      } else {
        prismaUser = await db.user.findUnique({ where: { id: userId } })

        if (!prismaUser) {
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Account not found — please sign in again',
          })
        }

        await setCachedUser(app.redis, prismaUser)
        authLog.info({ userId }, 'user cache miss — fetched from DB and cached')
      }

      request.authUser   = AuthUser.from(prismaUser)
      request.userProfile = UserProfile.from(prismaUser)
    },
  )
})
