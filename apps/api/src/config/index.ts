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
  BACHS_TEST_KEY: z.string().optional(),
  BACHS_LIVE_KEY: z.string().optional(),
  // Per-endpoint signing secrets from Bachs Developer Portal → Webhooks.
  // Separate from the API key — used to verify HMAC-SHA256 webhook signatures.
  BACHS_TEST_WH_SECRET: z.string().optional(),
  BACHS_LIVE_WH_SECRET: z.string().optional(),
  ACTIVE_PAYMENT_PROVIDER: z.string(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  ACTIVE_EMAIL_PROVIDER: z.string(),
  RESEND_API_KEY: z.string().optional(),
  SENDBYTE_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().default('onboarding@resend.dev'),
  // Redirect OTP emails to this address in non-production environments
  DEV_OTP_EMAIL: z.string().email().optional(),
}).superRefine((data, ctx) => {
  if (data.ACTIVE_PAYMENT_PROVIDER === 'bachs') {
    const isProduction = data.NODE_ENV === 'production'
    if (isProduction && !data.BACHS_LIVE_WH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BACHS_LIVE_WH_SECRET'],
        message: 'BACHS_LIVE_WH_SECRET is required when ACTIVE_PAYMENT_PROVIDER=bachs in production',
      })
    }
    if (!isProduction && !data.BACHS_TEST_WH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BACHS_TEST_WH_SECRET'],
        message: 'BACHS_TEST_WH_SECRET is required when ACTIVE_PAYMENT_PROVIDER=bachs in non-production',
      })
    }
  }
  if (data.ACTIVE_EMAIL_PROVIDER === 'resend' && !data.RESEND_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_API_KEY'],
      message: 'RESEND_API_KEY is required when ACTIVE_EMAIL_PROVIDER=resend',
    })
  }
  if (data.ACTIVE_EMAIL_PROVIDER === 'sendbyte' && !data.SENDBYTE_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SENDBYTE_API_KEY'],
      message: 'SENDBYTE_API_KEY is required when ACTIVE_EMAIL_PROVIDER=sendbyte',
    })
  }
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
