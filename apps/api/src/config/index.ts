import { z } from 'zod'
import { log } from '../lib/logger'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // Public URL of this API server — used by Better Auth to build OAuth callback
  // and email verification URLs. Must be reachable by external services (Google, email).
  APP_URL: z.string().default('http://localhost:3001'),
  // Public URL of the frontend app — used to build payment links (crove.app/e/{code})
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  // Optional — Google OAuth only activates when both are present.
  // Get these from https://console.cloud.google.com → APIs & Services → Credentials
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    log.config.fatal(
      { errors: parsed.error.flatten().fieldErrors },
      'Invalid environment variables',
    )
    process.exit(1)
  }
  return parsed.data
}

export const env = validateEnv()
