import { env } from '@/config'
import { Resend } from './resend'
import { SendByte } from './sendByte'
import type { EmailProvider, SendEmailParams, SendEmailResult } from './types'

export type { EmailProvider, SendEmailParams, SendEmailResult }

const SUPPORTED = new Set(['resend', 'sendbyte'])

export function getActiveEmailProvider(): EmailProvider {
  const active = env.ACTIVE_EMAIL_PROVIDER

  if (!SUPPORTED.has(active)) {
    throw new Error(
      `Unsupported email provider: "${active}". Supported: ${[...SUPPORTED].join(', ')}`,
    )
  }

  const from = env.EMAIL_FROM_ADDRESS

  switch (active) {
    case 'resend': {
      if (!env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is required when ACTIVE_EMAIL_PROVIDER=resend')
      }
      return new Resend(env.RESEND_API_KEY, from)
    }
    case 'sendbyte': {
      if (!env.SENDBYTE_API_KEY) {
        throw new Error('SENDBYTE_API_KEY is required when ACTIVE_EMAIL_PROVIDER=sendbyte')
      }
      return new SendByte(env.SENDBYTE_API_KEY, from)
    }
    default:
      throw new Error(`Unsupported email provider: "${active}"`)
  }
}

/** Send an email using whichever provider is currently active in the environment. */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  return getActiveEmailProvider().sendEmail(params)
}
