import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// In Prisma 7 the client no longer reads DATABASE_URL from the schema.
// We pass a pg connection pool to the adapter, which the client uses for all queries.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
})

const adapter = new PrismaPg(pool)

// Single PrismaClient instance shared across the entire API.
// Both the Fastify db plugin and Better Auth use this same instance
// to avoid opening multiple connection pools.
export const db = new PrismaClient({ adapter })
