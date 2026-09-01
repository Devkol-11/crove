import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'

export type EscrowJob =
  | { type: 'AUTO_RELEASE'; escrowId: string }
  | { type: 'PAYMENT_WEBHOOK'; provider: string; reference: string; status: string }

export function startEscrowWorker(redis: Redis) {
  const worker = new Worker<EscrowJob>(
    QUEUE_NAMES.ESCROW,
    async (job) => {
      console.log(`[escrow] Processing job ${job.id}: ${job.data.type}`)

      switch (job.data.type) {
        case 'AUTO_RELEASE':
          // TODO: implement automatic escrow release logic
          break
        case 'PAYMENT_WEBHOOK':
          // TODO: handle incoming payment provider webhooks
          break
      }
    },
    { connection: redis },
  )

  worker.on('failed', (job, err) => {
    console.error(`[escrow] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
