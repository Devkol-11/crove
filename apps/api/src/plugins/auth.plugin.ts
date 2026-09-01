import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../lib/auth'
import { db } from '../lib/prisma'
import { AuthUser } from '../modules/auth/domain/entity/auth-user.entity'
import { UserProfile } from '../modules/users/domain/entity/user-profile.entity'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    authUser: AuthUser | null
    userProfile: UserProfile | null
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('authUser', null)
  app.decorateRequest('userProfile', null)

  app.decorate(
    'authenticate',
    async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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

      const prismaUser = await db.user.findUnique({
        where: { id: session.user.id },
      })

      if (!prismaUser) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Account not found — please sign in again',
        })
      }

      request.authUser = AuthUser.from(prismaUser)
      request.userProfile = UserProfile.from(prismaUser)
    },
  )
})
