import type { PrismaClient } from '@prisma/client'
import { customAlphabet } from 'nanoid'
import { log } from '../../../../lib/logger'

const generateOtp = customAlphabet('0123456789', 6)
const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function createJoinOtp(
  db: PrismaClient,
  escrowId: string,
  name: string,
  email: string,
) {
  // Invalidate any existing unused OTPs for this email + escrow
  await db.escrowJoinOtp.updateMany({
    where: { escrowId, email, usedAt: null },
    data:  { usedAt: new Date() },
  })

  const code      = generateOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  const otp = await db.escrowJoinOtp.create({
    data: { escrowId, name, email, code, expiresAt },
  })

  // TODO: replace with email service (Resend / Nodemailer) in production
  log.auth.info(
    { escrowId, email, code },
    'join OTP generated — send this to the recipient (dev only)',
  )

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
      usedAt:    null,
      expiresAt: { gt: new Date() },
    },
  })

  if (!otp) return null

  await db.escrowJoinOtp.update({
    where: { id: otp.id },
    data:  { usedAt: new Date() },
  })

  return otp
}
