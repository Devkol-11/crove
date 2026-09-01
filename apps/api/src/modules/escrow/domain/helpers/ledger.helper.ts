import type { PrismaClient } from '@prisma/client'
import { customAlphabet } from 'nanoid'
import { LedgerEntryType } from '../../escrow.types'

type DbClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

const generateRef = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 12)

export async function appendLedgerEntry(
  db: DbClient,
  data: {
    escrowId: string
    type: LedgerEntryType
    amount: number
    currency: string
    description: string
    userId?: string
    reference?: string
  },
) {
  return db.ledgerEntry.create({
    data: {
      escrowId: data.escrowId,
      userId: data.userId ?? null,
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      reference: data.reference ?? `LDG-${generateRef()}`,
    },
  })
}

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
