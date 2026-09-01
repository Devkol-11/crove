import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { env } from './config'
import { auth } from './lib/auth'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // Infrastructure plugins (order matters — db/redis before auth, auth before routes)
  await app.register(import('./plugins/sensible.plugin'))
  await app.register(import('./plugins/db.plugin'))
  await app.register(import('./plugins/redis.plugin'))
  await app.register(import('./plugins/auth.plugin'))

  // Better Auth catch-all — handles all /api/auth/* routes automatically:
  //   POST /api/auth/sign-up/email
  //   POST /api/auth/sign-in/email
  //   POST /api/auth/sign-out
  //   GET  /api/auth/session
  //   GET  /api/auth/verify-email  ... and more
  app.all('/api/auth/*', async (request, reply) => {
    const response = await auth.handler(
      new Request(new URL(request.url, `http://localhost:${env.PORT}`), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        body: ['GET', 'HEAD'].includes(request.method) ? null : JSON.stringify(request.body),
      }),
    )

    reply.status(response.status)
    response.headers.forEach((value, key) => reply.header(key, value))
    reply.send(await response.text())
  })

  // Application routes
  await app.register(import('./modules/users/users.routes'), { prefix: '/api/users' })
  await app.register(import('./modules/escrow/escrow.routes'), { prefix: '/api/escrow' })

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }))

  return app
}
