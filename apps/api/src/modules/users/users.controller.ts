import type { FastifyRequest, FastifyReply } from 'fastify'
import type { UsersService } from './users.service'
import { updateProfileSchema } from './users.schema'

// usersHandlers returns plain async functions.
// Each function: parse request → call service → reply.send().
// No entity methods, no field picking, no domain knowledge.

export function usersHandlers(service: UsersService) {
  return {
    getProfile: async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await service.getProfile(request.authUser!.id))
    },

    updateProfile: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = updateProfileSchema.parse(request.body)
      return reply.send(await service.updateProfile(request.authUser!.id, body))
    },
  }
}
