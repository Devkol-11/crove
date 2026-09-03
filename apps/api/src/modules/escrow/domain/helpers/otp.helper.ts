import type { PrismaClient } from '@prisma/client'
import { customAlphabet } from 'nanoid'
import { sendEmail } from '../../../../third_party/email_providers'
import { otpJoinTemplate } from '../../../../config/email/templates/otp-join.template'
import { log } from '../../../../lib/logger'
import { env } from '../../../../config'

const generateOtp = customAlphabet('0123456789', 6)
const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes
const OTP_TTL_MINUTES = 10

export async function createJoinOtp(
  db: PrismaClient,
  escrowId: string,
  name: string,
  email: string,
) {
  // Invalidate any existing unused OTPs for this email + escrow
  await db.escrowJoinOtp.updateMany({
    where: { escrowId, email, usedAt: null },
    data: { usedAt: new Date() },
  })

  const code = generateOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  const otp = await db.escrowJoinOtp.create({
    data: { escrowId, name, email, code, expiresAt },
  })

  // Fetch escrow title for the email
  const escrow = await db.escrow.findUnique({
    where: { id: escrowId },
    select: { title: true },
  })

  const deliverTo = env.NODE_ENV !== 'production' && env.DEV_OTP_EMAIL ? env.DEV_OTP_EMAIL : email

  try {
    await sendEmail({
      to: deliverTo,
      ...otpJoinTemplate({
        recipientName: name,
        code,
        escrowTitle: escrow?.title ?? 'your escrow',
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    })
  } catch (err) {
    // Email failure must not block the OTP creation — log and continue
    log.auth.error(
      { escrowId, email, err: (err as Error).message },
      'OTP email delivery failed — code was still created',
    )
    // In dev, always log the code as a fallback
    if (process.env.NODE_ENV !== 'production') {
      log.auth.info({ escrowId, email, code }, 'join OTP (dev fallback)')
    }
  }

  return otp
}

export async function verifyJoinOtp(
  db: PrismaClient,
  escrowId: string,
  email: string,
  code: string,
) {
  const otp = await db.escrowJoinOtp.findFirst({
    where: {
      escrowId,
      email,
      code,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  })

  if (!otp) return null

  await db.escrowJoinOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  })

  return otp
}
