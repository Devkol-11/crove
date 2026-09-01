import type { PrismaClient, Prisma } from '@prisma/client'

type DbClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

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
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
}
