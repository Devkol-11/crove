import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { UsersService } from './users.service'
import { updateProfileSchema } from './users.schema'

export async function usersController(app: FastifyInstance) {
  const usersService = new UsersService(app.db)

  app.addHook('preHandler', app.authenticate)

  // GET /api/users/profile
  //
  // Notice how the response is built using entity METHODS, not direct field access.
  // getDisplayName() encapsulates the "firstName lastName || name" logic so the
  // controller doesn't need to know those rules.
  // hasCompletedProfile() answers a business question without leaking its criteria.
  app.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    // The authUser on the request was constructed in auth.plugin.ts from the
    // full Prisma row. We use it here to get the userId — a typed operation, not
    // a raw string from a JWT payload.
    const profile = await usersService.getProfile(request.authUser!.id)

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

  // PATCH /api/users/profile
  //
  // Zod validates the shape at the API boundary.
  // The service validates the VALUE (phone format) via Value Objects.
  // The entity encapsulates what "completed profile" means.
  app.patch('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = updateProfileSchema.parse(request.body)

    // UsersService.updateProfile() may throw if a Value Object constraint fails
    // (e.g. invalid phone number format). Fastify's error handler catches that
    // and returns a 500; ideally we'd convert domain errors to 400s — that's a
    // future improvement using a custom error mapper.
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
