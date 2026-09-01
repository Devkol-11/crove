import type { FastifyInstance } from 'fastify'
import { EscrowService } from './escrow.service'
import { escrowHandlers } from './escrow.controller'

export default async function escrowRoutes(app: FastifyInstance) {
  const service = new EscrowService(app.db, app)
  const h = escrowHandlers(service)

  // ── Public ────────────────────────────────────────────────────────────────
  // Payment link recipients view this without an account.
  app.get(
    '/:code/public',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    h.getPublic,
  )

  // ── Authenticated ─────────────────────────────────────────────────────────

  // GET /api/escrow — list escrows the user participates in
  app.get(
    '/',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    h.list,
  )

  // POST /api/escrow — create a new escrow
  app.post(
    '/',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    h.create,
  )

  // GET /api/escrow/:code — full authenticated view
  app.get(
    '/:code',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    h.getByCode,
  )

  // POST /api/escrow/:id/transition — trigger a state change
  app.post(
    '/:id/transition',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    h.transition,
  )

  // POST /api/escrow/:id/dispute — open a dispute on a funded escrow
  app.post(
    '/:id/dispute',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    h.openDispute,
  )

  // POST /api/escrow/disputes/:id/resolve — resolve an open dispute
  app.post(
    '/disputes/:id/resolve',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    h.resolveDispute,
  )

  // GET /api/escrow/:id/balance — ledger-derived held balance
  app.get(
    '/:id/balance',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    h.getLedgerBalance,
  )
}
