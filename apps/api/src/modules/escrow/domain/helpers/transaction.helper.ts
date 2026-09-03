import type { PrismaClient, Prisma } from '@prisma/client'
import { customAlphabet } from 'nanoid'
import { TransactionType, TransactionStatus } from '../../escrow.types'

type DbClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

const generateRef = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 12)

export async function createTransaction(
  db: DbClient,
  data: {
    escrowId:    string
    type:        TransactionType
    amount:      number
    currency:    string
    provider?:   string
    providerRef?: string
    metadata?:   Record<string, unknown>
  },
) {
  return db.escrowTransaction.create({
    data: {
      escrowId:   data.escrowId,
      type:       data.type,
      amount:     data.amount,
      currency:   data.currency,
      reference:  `TXN-${generateRef()}`,
      status:     TransactionStatus.Pending,
      provider:   data.provider ?? null,
      providerRef: data.providerRef ?? null,
      metadata:   (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
}
