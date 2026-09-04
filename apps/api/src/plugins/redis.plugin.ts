import fp from 'fastify-plugin'
import Redis from 'ioredis'
import type { FastifyInstance } from 'fastify'
import { env } from '../config'
import { log } from '../lib/logger'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

const redisLog = log.redis

// Max reconnect delay per attempt during runtime disconnection
const MAX_RECONNECT_ATTEMPTS = 15
const CONNECT_TIMEOUT_MS     = 6_000

export default fp(async function redisPlugin(app: FastifyInstance) {
  // Tracks whether we have EVER had a successful connection.
  // retryStrategy uses this to distinguish:
  //   - startup failure  → fail fast (return null = stop retrying)
  //   - runtime outage   → allow exponential-backoff reconnects
  let hasConnectedOnce = false

  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,        // don't auto-connect on construction
    maxRetriesPerRequest: null, // required by BullMQ — lets it manage its own command retries

    retryStrategy(times) {
      if (!hasConnectedOnce) {
        // Initial connection failed — don't retry; let connect() reject immediately.
        return null
      }
      if (times > MAX_RECONNECT_ATTEMPTS) {
        redisLog.error({ times }, 'Redis: max reconnect attempts reached — giving up')
        return null
      }
      // Exponential backoff: 200 ms → 400 → 800 … capped at 10 s
      const delay = Math.min(2 ** (times - 1) * 200, 10_000)
      redisLog.warn({ attempt: times, delayMs: delay }, 'Redis reconnecting…')
      return delay
    },
  })

  // ── Event listeners ────────────────────────────────────────────────────────

  redis.on('ready', () => {
    hasConnectedOnce = true
    redisLog.info('Redis ready')
  })

  redis.on('close', () => {
    if (hasConnectedOnce) {
      redisLog.warn('Redis connection closed')
    }
  })

  redis.on('error', (err: Error) => {
    // Suppress errors during initial connection attempt — a single clear fatal
    // message is emitted in the catch block below instead of a flood of retries.
    if (hasConnectedOnce) {
      redisLog.error({ err: err.message }, 'Redis error')
    }
  })

  // ── Pre-flight connection check ────────────────────────────────────────────

  try {
    await Promise.race([
      redis.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Redis did not respond within ${CONNECT_TIMEOUT_MS / 1000}s`)),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ])
  } catch (err) {
    // Disconnect the stuck/failed connection attempt before bailing.
    redis.disconnect()

    const reason = (err as Error).message
    redisLog.fatal(
      { url: env.REDIS_URL, reason },
      'Redis is unreachable — server cannot start. Ensure your containers are running (docker compose up -d).',
    )
    throw new Error(`Redis connection failed: ${reason}`)
  }

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    try {
      await redis.quit()
    } catch {
      redis.disconnect()
    }
  })
})
