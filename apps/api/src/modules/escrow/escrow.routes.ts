import type { FastifyInstance } from 'fastify'
import { EscrowService } from './escrow.service'
import { escrowHandlers } from './escrow.controller'

export default async function escrowRoutes(app: FastifyInstance) {
  const service = new EscrowService(app.db, app)
  const h = escrowHandlers(service)

  // ── Public routes (no auth) ───────────────────────────────────────────────

  // Role-aware view for link recipients — returns funding status + which role is still open
  app.get(
    '/:code/public',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    h.getPublicView,
  )

  // Create a quick link escrow without an account
  app.post(
    '/quick',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    h.createQuick,
  )

  // Request OTP to join a quick link escrow as the missing participant
  app.post(
    '/:code/join',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    h.requestJoinOtp,
  )

  // Verify OTP and join the escrow
  app.post(
    '/:code/join/verify',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    h.verifyJoinAndJoin,
  )

  // ── Authenticated routes ──────────────────────────────────────────────────

  const auth = { preHandler: app.authenticate }

  // List escrows the user participates in
  app.get(
    '/',
    { ...auth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    h.list,
  )

  // Create a full escrow (Standard / Milestone / Conditional / Deposit)
  app.post(
    '/',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    h.create,
  )

  // Full authenticated view of an escrow
  app.get(
    '/:code',
    { ...auth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    h.getByCode,
  )

  // Fund — Payer deposits money, transitions escrow to Funded
  app.post(
    '/:id/fund',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    h.fund,
  )

  // Release — Payer approves delivery, releases funds to Payee
  app.post(
    '/:id/release',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    h.release,
  )

  // Refund — return funds to Payer (mutual agreement or admin decision)
  app.post(
    '/:id/refund',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    h.refund,
  )

  // Cancel — cancel before funding
  app.post(
    '/:id/cancel',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    h.cancel,
  )

  // Open a dispute on a funded escrow
  app.post(
    '/:id/dispute',
    { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    h.openDispute,
  )

  // Resolve an open dispute
  app.post(
    '/disputes/:id/resolve',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    h.resolveDispute,
  )

  // Milestone: Payee marks work as done, Payer receives review request
  app.post(
    '/:id/milestones/:milestoneId/submit',
    { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    h.submitMilestone,
  )

  // Milestone: Payer approves submitted work, triggers partial release
  app.post(
    '/:id/milestones/:milestoneId/approve',
    { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    h.approveMilestone,
  )

  // Ledger balance (how much is currently held)
  app.get(
    '/:id/balance',
    { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    h.getLedgerBalance,
  )
}
