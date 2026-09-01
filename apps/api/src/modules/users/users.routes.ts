import type { FastifyInstance } from 'fastify'
import { usersController } from './users.controller'

export default async function usersRoutes(app: FastifyInstance) {
  await usersController(app)
}
