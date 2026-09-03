import { Queue } from 'bullmq'
import type Redis from 'ioredis'

export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  ESCROW: 'escrow',
  AUTH: 'auth',
  PAYMENT: 'payment',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

let _notificationsQueue: Queue | undefined
let _escrowQueue: Queue | undefined
let _authQueue: Queue | undefined
let _paymentQueue: Queue | undefined

export function createQueues(redis: Redis) {
  _notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection: redis })
  _escrowQueue = new Queue(QUEUE_NAMES.ESCROW, { connection: redis })
  _authQueue = new Queue(QUEUE_NAMES.AUTH, { connection: redis })
  _paymentQueue = new Queue(QUEUE_NAMES.PAYMENT, { connection: redis })

  return {
    notificationsQueue: _notificationsQueue,
    escrowQueue: _escrowQueue,
    authQueue: _authQueue,
    paymentQueue: _paymentQueue,
  }
}

export function getQueues() {
  return {
    notificationsQueue: _notificationsQueue,
    escrowQueue: _escrowQueue,
    authQueue: _authQueue,
    paymentQueue: _paymentQueue,
  }
}
