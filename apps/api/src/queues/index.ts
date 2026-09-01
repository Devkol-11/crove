import { Queue } from 'bullmq'
import type Redis from 'ioredis'

// Queue names — centralised so workers and producers stay in sync
export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  ESCROW: 'escrow',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

let notificationsQueue: Queue
let escrowQueue: Queue

export function createQueues(redis: Redis) {
  const connection = redis

  notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection })
  escrowQueue = new Queue(QUEUE_NAMES.ESCROW, { connection })

  return { notificationsQueue, escrowQueue }
}

export { notificationsQueue, escrowQueue }
