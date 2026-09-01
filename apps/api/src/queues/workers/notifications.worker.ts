import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'

export type NotificationJob =
  | { type: 'ESCROW_CREATED'; to: string; escrowCode: string; amount: number; currency: string }
  | { type: 'ESCROW_FUNDED'; to: string; escrowCode: string }
  | { type: 'ESCROW_RELEASED'; to: string; escrowCode: string; amount: number }
  | { type: 'DISPUTE_RAISED'; to: string; escrowCode: string }

export function startNotificationsWorker(redis: Redis) {
  const worker = new Worker<NotificationJob>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      // TODO: replace with actual email/SMS provider (e.g. Resend, Nodemailer)
      console.log(`[notifications] Processing job ${job.id}: ${job.data.type}`)
    },
    { connection: redis },
  )

  worker.on('failed', (job, err) => {
    console.error(`[notifications] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
