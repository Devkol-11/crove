import type { PrismaClient } from '@prisma/client'

// DbClient accepts both the regular PrismaClient and the transaction client
// returned inside db.$transaction(async (tx) => ...).
// Prisma's transaction client is structurally identical to PrismaClient for
// model operations — it just omits the connection-control methods.
type DbClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

// ── appendEscrowEvent ────────────────────────────────────────────────────────
//
// This is the ONLY function that writes to the escrow_events table.
// No update function exists — that is the point.
// EscrowEvent rows are an append-only audit log: once written they are facts.
// Calling code can never accidentally overwrite or delete event history.
//
// Usage:
//   await appendEscrowEvent(db, escrowId, 'EscrowFunded', userId)
//   await appendEscrowEvent(tx, escrowId, 'DisputeOpened', userId, { reason })

export async function appendEscrowEvent(
  db: DbClient,
  escrowId: string,
  type: string,
  actor: string,
  metadata?: Record<string, unknown>,
) {
  return db.escrowEvent.create({
    data: {
      escrowId,
      type,
      actor,
      metadata: metadata ?? null,
    },
  })
}
