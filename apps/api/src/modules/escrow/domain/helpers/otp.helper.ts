import type { Redis } from 'ioredis'
import { customAlphabet } from 'nanoid'
import { sendEmail } from '../../../../third_party/email_providers'
import { otpJoinTemplate } from '../../../../config/email/templates/otp-join.template'
import { log } from '../../../../lib/logger'
import { env } from '../../../../config'

const generateOtp    = customAlphabet('0123456789', 6)
const OTP_TTL_SEC    = 10 * 60  // 10 minutes
const OTP_TTL_MIN    = 10

interface StoredJoinOtp { name: string; email: string; code: string }

const joinOtpKey = (escrowId: string, email: string) => `crove:jotp:${escrowId}:${email}`

export async function createJoinOtp(
  redis: Redis,
  escrowId: string,
  name: string,
  email: string,
  escrowTitle: string,
) {
  const code = generateOtp()

  // Overwrite any existing OTP for this email+escrow — single active OTP per pair
  await redis.setex(joinOtpKey(escrowId, email), OTP_TTL_SEC, JSON.stringify({ name, email, code }))

  const isDev = env.NODE_ENV !== 'production'

  if (isDev) {
    log.auth.info(
      { escrowId, email, code, expiresInMinutes: OTP_TTL_MIN },
      'JOIN OTP — use this code to verify (dev)',
    )
  }

  if (isDev && !env.DEV_OTP_EMAIL) return { name, email, code }

  const deliverTo = isDev && env.DEV_OTP_EMAIL ? env.DEV_OTP_EMAIL : email

  try {
    await sendEmail({
      to: deliverTo,
      ...otpJoinTemplate({
        recipientName:    name,
        code,
        escrowTitle,
        expiresInMinutes: OTP_TTL_MIN,
      }),
    })
  } catch (err) {
    log.auth.error(
      { escrowId, email, deliverTo, err: (err as Error).message },
      'OTP email delivery failed — code was still created and logged',
    )
  }

  return { name, email, code }
}

export async function verifyJoinOtp(
  redis: Redis,
  escrowId: string,
  email: string,
  code: string,
) {
  const key = joinOtpKey(escrowId, email)
  const raw = await redis.get(key)
  if (!raw) return null

  const stored = JSON.parse(raw) as StoredJoinOtp
  if (stored.code !== code) return null

  await redis.del(key)  // single-use — consumed on success
  return stored
}
