import type { PrismaClient } from '@prisma/client'
import { customAlphabet } from 'nanoid'
import { TransactionType, TransactionStatus } from '../../escrow.types'

type DbClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

const generateRef = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 12)

// ── createTransaction ────────────────────────────────────────────────────────
//
// The ONLY function that writes to escrow_transactions.
// All transactions start as Pending — the payment provider's webhook
// is responsible for moving them to Completed or Failed via a direct
// db.escrowTransaction.update() in the escrow worker.
//
// Why no updateTransaction() here?
// Transactions represent payment attempts. Creating a new record per attempt
// keeps the full history. Status updates happen only from the webhook path,
// not from general application code.

export async function createTransaction(
  db: DbClient,
  data: {
    escrowId:   string
    type:       TransactionType
    amount:     number
    currency:   string
    provider?:  string
    metadata?:  Record<string, unknown>
  },
) {
  return db.escrowTransaction.create({
    data: {
      escrowId:  data.escrowId,
      type:      data.type,
      amount:    data.amount,
      currency:  data.currency,
      reference: `TXN-${generateRef()}`,
      status:    TransactionStatus.Pending,
      provider:  data.provider ?? null,
      metadata:  data.metadata ?? null,
    },
  })
}
