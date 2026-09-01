import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { EscrowService } from './escrow.service'
import { createEscrowSchema } from './escrow.schema'

export async function escrowController(app: FastifyInstance) {
  const escrowService = new EscrowService(app.db, app)

  // ── Public route (no auth) ────────────────────────────────────────────────
  //
  // The payment link recipient doesn't need an account to VIEW the escrow.
  // They see title, amount, parties, and release condition — enough to decide
  // whether to fund or participate.
  app.get(
    '/:code/public',
    async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
      const escrow = await escrowService.getByCode(request.params.code)
      return reply.send(escrow)
    },
  )

  // ── Authenticated routes ──────────────────────────────────────────────────
  app.register(async (authed) => {
    authed.addHook('preHandler', app.authenticate)

    // POST /api/escrow
    // Create a new escrow. The creator is always the authenticated user.
    // No need to pass creatorId in the body — we get it from the verified session.
    authed.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createEscrowSchema.parse(request.body)

      // request.authUser is the domain entity — .id is the typed user ID,
      // not a raw JWT claim. The entity was constructed from a fresh DB row
      // in auth.plugin.ts, so it's always up to date.
      const escrow = await escrowService.create(request.authUser!.id, body)

      return reply.code(201).send(escrow)
    })

    // GET /api/escrow
    // List all escrows the authenticated user is involved in
    // (as creator, buyer, or seller).
    authed.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
      const escrows = await escrowService.listByUser(request.authUser!.id)
      return reply.send(escrows)
    })

    // GET /api/escrow/:code
    // Authenticated view — same data as the public route but the client
    // can also take actions (fund, release, dispute) from here.
    authed.get(
      '/:code',
      async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
        const escrow = await escrowService.getByCode(request.params.code)
        return reply.send(escrow)
      },
    )

    // POST /api/escrow/:id/transition
    // Trigger a state change on an escrow the user participates in.
    // The service uses EscrowAggregate to validate the transition and
    // check the actor's role before writing to DB.
    authed.post(
      '/:id/transition',
      async (
        request: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>,
        reply: FastifyReply,
      ) => {
        const { id } = request.params
        const { status } = request.body as { status: string }

        const updated = await escrowService.transition(
          id,
          request.authUser!.id,
          status as any,
        )

        return reply.send(updated)
      },
    )
  })
}
