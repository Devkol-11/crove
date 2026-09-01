import type { FastifyInstance } from 'fastify'
import { escrowController } from './escrow.controller'

export default async function escrowRoutes(app: FastifyInstance) {
  await escrowController(app)
}
