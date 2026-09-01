import type { FastifyRequest, FastifyReply } from 'fastify'
import type { EscrowService } from './escrow.service'
import {
  createEscrowSchema,
  transitionSchema,
  openDisputeSchema,
  resolveDisputeSchema,
} from './escrow.schema'

// escrowHandlers returns plain async functions.
// Each function: parse request → call service → reply.send().
// No domain logic, no entity methods, no field picking.

export function escrowHandlers(service: EscrowService) {
  return {
    // GET /:code/public — no auth required
    getPublic: async (request: FastifyRequest, reply: FastifyReply) => {
      const { code } = request.params as { code: string }
      return reply.send(await service.getByCode(code))
    },

    // GET /
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await service.listByUser(request.authUser!.id))
    },

    // POST /
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createEscrowSchema.parse(request.body)
      return reply.code(201).send(await service.create(request.authUser!.id, body))
    },

    // GET /:code
    getByCode: async (request: FastifyRequest, reply: FastifyReply) => {
      const { code } = request.params as { code: string }
      return reply.send(await service.getByCode(code))
    },

    // POST /:id/transition
    transition: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const { status } = transitionSchema.parse(request.body)
      return reply.send(await service.transition(id, request.authUser!.id, status))
    },

    // POST /:id/dispute
    openDispute: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const { reason } = openDisputeSchema.parse(request.body)
      return reply.code(201).send(await service.openDispute(id, request.authUser!.id, reason))
    },

    // POST /disputes/:id/resolve
    resolveDispute: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const { resolution } = resolveDisputeSchema.parse(request.body)
      return reply.send(await service.resolveDispute(id, resolution, request.authUser!.id))
    },

    // GET /:id/balance
    getLedgerBalance: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      return reply.send(await service.getLedgerBalance(id))
    },
  }
}
