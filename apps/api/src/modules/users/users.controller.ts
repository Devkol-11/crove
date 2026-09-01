import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { UsersService } from './users.service'
import { updateProfileSchema } from './users.schema'

export async function usersController(app: FastifyInstance) {
  const usersService = new UsersService(app.db)

  app.addHook('preHandler', app.authenticate)

  app.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await usersService.getProfile(request.authUser!.id)

    return reply.send({
      id: profile.id,
      email: profile.email,
      displayName: profile.getDisplayName(), // entity method — not raw fields
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      image: profile.image,
      hasCompletedProfile: profile.hasCompletedProfile(), // business question on entity
    })
  })

  app.patch('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = updateProfileSchema.parse(request.body)

    const profile = await usersService.updateProfile(request.authUser!.id, body)

    return reply.send({
      id: profile.id,
      displayName: profile.getDisplayName(),
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      hasCompletedProfile: profile.hasCompletedProfile(),
    })
  })
}
