import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { env } from './config'
import { auth } from './lib/auth'
import { log } from './lib/logger'

const authLog = log.auth

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

  // Better Auth catch-all — handles all /api/auth/* routes automatically.
  app.all('/api/auth/*', async (request, reply) => {
    const headers = fromNodeHeaders(request.headers)

    // Better Auth requires an Origin header to perform CSRF validation.
    // Browsers always send it; non-browser clients (Postman, mobile apps,
    // server-to-server) do not. CSRF is a browser-only attack vector, so
    // injecting the API's own origin for header-less requests is safe.
    if (!request.headers.origin) {
      headers.set('origin', env.APP_URL)
    }

    const path = request.url
    const method = request.method

    authLog.info({ method, path }, 'auth request received')

    let responseBody: string
    let response: Response

    try {
      response = await auth.handler(
        new Request(new URL(path, env.APP_URL), {
          method,
          headers,
          body: ['GET', 'HEAD'].includes(method) ? null : JSON.stringify(request.body),
        }),
      )

      responseBody = await response.text()
    } catch (err) {
      authLog.error(
        { method, path, err: (err as Error).message },
        'auth handler threw unexpectedly',
      )
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Authentication service encountered an unexpected error',
      })
    }

    if (!response.ok) {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(responseBody) as Record<string, unknown>
      } catch {
        parsed = { raw: responseBody }
      }

      authLog.error(
        {
          method,
          path,
          status: response.status,
          code: parsed.code,
          message: parsed.message,
        },
        `auth error [${response.status}]: ${parsed.message ?? parsed.code ?? 'unknown'}`,
      )
    } else {
      authLog.info({ method, path, status: response.status }, 'auth request completed')
    }

    reply.status(response.status)
    response.headers.forEach((value, key) => reply.header(key, value))
    reply.send(responseBody)
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
