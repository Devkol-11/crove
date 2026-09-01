import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { db } from '../lib/prisma'

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient
  }
}

export default fp(async function dbPlugin(app: FastifyInstance) {
  await db.$connect()
  app.log.info('Database connected')

  // Share the same singleton instance used by Better Auth
  app.decorate('db', db)

  app.addHook('onClose', async () => {
    await db.$disconnect()
  })
})
