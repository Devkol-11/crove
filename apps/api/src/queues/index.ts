import { Queue } from 'bullmq'
import type Redis from 'ioredis'

// Queue names — centralised so workers and producers stay in sync
export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  ESCROW: 'escrow',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

// Module-level references, populated once by createQueues() on startup.
// DO NOT import these directly — use getQueues() instead.
// Reason: tsup compiles to CommonJS, so direct named imports get the value at
// module-load time (undefined). getQueues() reads the variable at call time,
// after createQueues() has run.
let _notificationsQueue: Queue | undefined
let _escrowQueue: Queue | undefined

export function createQueues(redis: Redis) {
  _notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection: redis })
  _escrowQueue        = new Queue(QUEUE_NAMES.ESCROW,         { connection: redis })

  return { notificationsQueue: _notificationsQueue, escrowQueue: _escrowQueue }
}

// Safe accessor — returns queues once initialised, undefined before that.
// Callers (EventDispatcher) must guard against undefined for the rare case
// where an event fires before startup completes.
export function getQueues() {
  return {
    notificationsQueue: _notificationsQueue,
    escrowQueue:        _escrowQueue,
  }
}
