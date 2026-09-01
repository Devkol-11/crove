import fp from 'fastify-plugin'
import sensible from '@fastify/sensible'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import { env } from '../config'

export default fp(async function sensiblePlugin(app: FastifyInstance) {
  await app.register(sensible)

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })

  await app.register(helmet)

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    }),
  })
})
