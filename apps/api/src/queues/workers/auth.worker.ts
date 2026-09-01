import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { db } from '../../lib/prisma'
import { log } from '../../lib/logger'
import { QUEUE_NAMES } from '../index'

const workerLog = log.worker.auth

export const AUTH_JOBS = {
  CLEANUP_ORPHANED_USER: 'cleanup-orphaned-user',
} as const

export interface CleanupOrphanedUserPayload {
  userId: string
}

export function startAuthWorker(redis: Redis) {
  const worker = new Worker<CleanupOrphanedUserPayload>(
    QUEUE_NAMES.AUTH,
    async (job) => {
      if (job.name === AUTH_JOBS.CLEANUP_ORPHANED_USER) {
        const { userId } = job.data

        const user = await db.user.findUnique({
          where: { id: userId },
          include: { accounts: { take: 1 } },
        })

        if (!user) return // already deleted or never existed
        if (user.accounts.length > 0) return // sign-up completed successfully, nothing to do

        await db.user.delete({ where: { id: userId } })
        workerLog.warn({ userId }, 'deleted orphaned user — no account was linked after sign-up')
      }
    },
    { connection: redis },
  )

  worker.on('ready', () => {
    workerLog.info({ queue: QUEUE_NAMES.AUTH }, 'worker connected and listening')
  })

  worker.on('error', (err) => {
    workerLog.error({ err: err.message }, 'worker connection error')
  })

  worker.on('completed', (job) => {
    workerLog.info({ jobId: job.id, jobName: job.name }, 'job completed')
  })

  worker.on('failed', (job, err) => {
    workerLog.error({ jobId: job?.id, jobName: job?.name, err: err.message }, 'job failed')
  })

  return worker
}
