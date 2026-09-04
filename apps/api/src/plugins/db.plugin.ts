import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { db } from '../lib/prisma'
import { log } from '../lib/logger'

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient
  }
}

const dbLog = log.db

const CONNECT_TIMEOUT_MS = 10_000

export default fp(async function dbPlugin(app: FastifyInstance) {
  try {
    await Promise.race([
      db.$connect(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Database did not respond within ${CONNECT_TIMEOUT_MS / 1000}s`)),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ])
    dbLog.info('Database connected')
  } catch (err) {
    const reason = (err as Error).message
    dbLog.fatal(
      { reason },
      'Database is unreachable — server cannot start. Ensure your containers are running (docker compose up -d).',
    )
    throw new Error(`Database connection failed: ${reason}`)
  }

  // Share the same singleton instance used by Better Auth
  app.decorate('db', db)

  app.addHook('onClose', async () => {
    await db.$disconnect()
  })
})
