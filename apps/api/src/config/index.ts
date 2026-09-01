import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2))
    process.exit(1)
  }
  return parsed.data
}

export const env = validateEnv()
