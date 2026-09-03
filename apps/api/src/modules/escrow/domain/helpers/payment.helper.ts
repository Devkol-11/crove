import type { PrismaClient } from '@prisma/client'

export async function createPaymentRecord(
  db: PrismaClient,
  data: {
    escrowId:   string
    reference:  string
    provider:   string
    amount:     number
    currency:   string
    payerEmail: string
  },
) {
  return db.payment.create({
    data: {
      escrowId:   data.escrowId,
      reference:  data.reference,
      provider:   data.provider,
      amount:     data.amount,
      currency:   data.currency,
      payerEmail: data.payerEmail,
      status:     'Pending',
    },
  })
}
