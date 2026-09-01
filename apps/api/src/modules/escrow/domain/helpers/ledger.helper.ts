import type { PrismaClient } from '@prisma/client'
import { customAlphabet } from 'nanoid'
import { LedgerEntryType } from '../../escrow.types'

type DbClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

const generateRef = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 12)

// ── appendLedgerEntry ─────────────────────────────────────────────────────────
//
// Every money movement in the application goes through this function.
// The ledger_entries table is strictly append-only — rows are never updated or deleted.
// This is the internal accounting layer: if you need to know the financial state
// of any escrow at any point in time, you reconstruct it from these entries.
//
// The `reference` field is a unique idempotency key — pass your own if you have
// one (e.g. the payment provider's transaction reference). If omitted, a random
// one is generated. The DB enforces uniqueness, so a double-write will throw
// rather than silently create a duplicate entry.
//
// Ledger entry types:
//   Funding — buyer deposits funds (credit: money in)
//   Release — funds disbursed to seller (debit: money out)
//   Refund  — funds returned to buyer (debit: money out)
//   Fee     — platform fee deducted (credit: platform keeps it)

export async function appendLedgerEntry(
  db: DbClient,
  data: {
    escrowId:    string
    type:        LedgerEntryType
    amount:      number
    currency:    string
    description: string
    userId?:     string    // The party this movement is for/from
    reference?:  string    // Provide for idempotency; auto-generated if omitted
  },
) {
  return db.ledgerEntry.create({
    data: {
      escrowId:    data.escrowId,
      userId:      data.userId ?? null,
      type:        data.type,
      amount:      data.amount,
      currency:    data.currency,
      description: data.description,
      reference:   data.reference ?? `LDG-${generateRef()}`,
    },
  })
}

// ── getLedgerBalance ──────────────────────────────────────────────────────────
//
// Reconstructs the current held balance for an escrow by summing its ledger entries.
// Funding adds to the balance; Release and Refund reduce it; Fee is separate.
//
// This is the authoritative source for "how much money is currently held in escrow?"
// Never derive this from the escrow.amount field alone — use the ledger.

export async function getLedgerBalance(
  db: DbClient,
  escrowId: string,
): Promise<{ held: number; totalFees: number; currency: string }> {
  const entries = await db.ledgerEntry.findMany({ where: { escrowId } })

  if (entries.length === 0) return { held: 0, totalFees: 0, currency: 'NGN' }

  let held = 0
  let totalFees = 0

  for (const entry of entries) {
    const amount = Number(entry.amount)
    switch (entry.type as LedgerEntryType) {
      case LedgerEntryType.Funding:
        held += amount
        break
      case LedgerEntryType.Release:
      case LedgerEntryType.Refund:
        held -= amount
        break
      case LedgerEntryType.Fee:
        totalFees += amount
        break
    }
  }

  return { held, totalFees, currency: entries[0].currency }
}
