import type { FastifyInstance } from 'fastify'
import { UsersService } from './users.service'
import { usersHandlers } from './users.controller'

// This file owns the HTTP layer for the users module:
//   - URL paths and HTTP methods
//   - Authentication (preHandler per route)
//   - Per-route rate limits (override the global 100/min default)
//
// The controller only knows about parsing and replying.
// The service only knows about business logic.
// Nothing from the domain leaks past the service boundary.

export default async function usersRoutes(app: FastifyInstance) {
  const service = new UsersService(app.db, app)
  const h = usersHandlers(service)

  // GET /api/users/profile
  app.get('/profile', {
    preHandler: app.authenticate,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, h.getProfile)

  // PATCH /api/users/profile
  app.patch('/profile', {
    preHandler: app.authenticate,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, h.updateProfile)
}
