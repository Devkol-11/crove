import fp from 'fastify-plugin'
import Redis from 'ioredis'
import type { FastifyInstance } from 'fastify'
import { env } from '../config'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export default fp(async function redisPlugin(app: FastifyInstance) {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  })

  redis.on('connect', () => app.log.info('Redis connected'))
  redis.on('error', (err) => app.log.error({ err }, 'Redis connection error'))

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await redis.quit()
  })
})
