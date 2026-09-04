import 'dotenv/config'
import { buildApp } from './app'
import { env } from './config'
import { createQueues } from './pub_sub'
import { startNotificationsWorker } from './pub_sub/workers/notifications.worker'
import { startEscrowWorker } from './pub_sub/workers/escrow.worker'
import { startAuthWorker } from './pub_sub/workers/auth.worker'
import { startPaymentWorker } from './pub_sub/workers/payment.worker'
import { startPayoutWorker } from './pub_sub/workers/payout.worker'
import { log } from './lib/logger'
import type { Worker } from 'bullmq'
import type { FastifyInstance } from 'fastify'

const serverLog = log.server

// ── Global process error guards ───────────────────────────────────────────────
// These are the last line of defence. They catch anything that escapes the normal
// error handling layers (request handlers, plugin hooks, worker try/catch blocks).

process.on('uncaughtException', (err: Error) => {
  serverLog.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception — process will exit')
  process.exit(1)
})

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack   = reason instanceof Error ? reason.stack   : undefined
  serverLog.fatal({ reason: message, stack }, 'Unhandled promise rejection — process will exit')
  process.exit(1)
})

// ── Startup ───────────────────────────────────────────────────────────────────

const start = async () => {
  let app: FastifyInstance | undefined
  let workers: Worker[] = []

  // Build the app. If Redis or DB is unreachable, buildApp() throws a clear
  // fatal message (from redis.plugin / db.plugin) and we exit cleanly here.
  try {
    app = await buildApp()
  } catch (err) {
    serverLog.fatal(
      { err: (err as Error).message },
      'Server failed to start — fix infrastructure errors above and retry',
    )
    process.exit(1)
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  // app is guaranteed to be defined here.

  const shutdown = async (signal: string) => {
    serverLog.info({ signal }, 'Shutdown signal received — closing server gracefully')
    try {
      // Close BullMQ workers first so in-flight jobs finish before connections drop
      await Promise.allSettled(workers.map((w) => w.close()))
      // Fastify onClose hooks disconnect Redis + DB
      await app!.close()
      serverLog.info('Server shut down cleanly')
      process.exit(0)
    } catch (shutdownErr) {
      serverLog.error(
        { err: (shutdownErr as Error).message },
        'Error during graceful shutdown — forcing exit',
      )
      process.exit(1)
    }
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT',  () => void shutdown('SIGINT'))

  // ── BullMQ queues and workers ─────────────────────────────────────────────
  // Redis is confirmed reachable at this point (redis.plugin pre-flight passed).

  createQueues(app.redis)

  workers = [
    startNotificationsWorker(app.redis),
    startEscrowWorker(app.redis),
    startAuthWorker(app.redis),
    startPaymentWorker(app.redis),
    startPayoutWorker(app.redis),
  ]

  // ── HTTP listen ───────────────────────────────────────────────────────────

  try {
    await app.listen({ port: Number(env.PORT), host: '0.0.0.0' })
  } catch (err) {
    serverLog.fatal({ err: (err as Error).message }, 'Failed to bind to port — exiting')
    process.exit(1)
  }
}

start()
