import type { FastifyRequest, FastifyReply } from 'fastify'
import type { EscrowService } from './escrow.service'
import {
  createEscrowSchema,
  createQuickEscrowSchema,
  joinRequestSchema,
  joinVerifySchema,
  openDisputeSchema,
  resolveDisputeSchema,
} from './escrow.schema'

export function escrowHandlers(service: EscrowService) {
  return {
    // ── Public (no auth) ────────────────────────────────────────────────────

    // GET /:code/public — role-aware view for link recipients
    getPublicView: async (request: FastifyRequest, reply: FastifyReply) => {
      const { code } = request.params as { code: string }
      return reply.send(await service.getPublicView(code))
    },

    // POST /quick — create a quick link escrow, no account required
    createQuick: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createQuickEscrowSchema.parse(request.body)
      return reply.code(201).send(await service.createQuick(body))
    },

    // POST /:code/join — request OTP to join a quick link escrow
    requestJoinOtp: async (request: FastifyRequest, reply: FastifyReply) => {
      const { code } = request.params as { code: string }
      const body = joinRequestSchema.parse(request.body)
      return reply.send(await service.requestJoinOtp(code, body))
    },

    // POST /:code/join/verify — verify OTP and join the escrow
    verifyJoinAndJoin: async (request: FastifyRequest, reply: FastifyReply) => {
      const { code } = request.params as { code: string }
      const body = joinVerifySchema.parse(request.body)
      return reply.code(201).send(await service.verifyJoinAndJoin(code, body))
    },

    // ── Authenticated ────────────────────────────────────────────────────────

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

    // POST /:id/fund
    fund: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      return reply.send(await service.fundEscrow(id, request.authUser!.id))
    },

    // POST /:id/release
    release: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      return reply.send(await service.releaseEscrow(id, request.authUser!.id))
    },

    // POST /:id/refund
    refund: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      return reply.send(await service.refundEscrow(id, request.authUser!.id))
    },

    // POST /:id/cancel
    cancel: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      return reply.send(await service.cancelEscrow(id, request.authUser!.id))
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

    // POST /:id/milestones/:milestoneId/submit
    submitMilestone: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, milestoneId } = request.params as { id: string; milestoneId: string }
      return reply.send(await service.submitMilestone(id, milestoneId, request.authUser!.id))
    },

    // POST /:id/milestones/:milestoneId/approve
    approveMilestone: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, milestoneId } = request.params as { id: string; milestoneId: string }
      return reply.send(await service.approveMilestone(id, milestoneId, request.authUser!.id))
    },

    // GET /:id/balance
    getLedgerBalance: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      return reply.send(await service.getLedgerBalance(id))
    },
  }
}
