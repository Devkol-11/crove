import { env } from '@/config'
import { Bachs } from './bachs'
import { Paystack } from './paystack'
import type { PaymentProvider } from './types'

export type { PaymentProvider }
export type { InitiatePaymentParams, PaymentInitiationResult, VerifyPaymentResult } from './types'
export { PaymentError } from './payment.error'
export { Bachs } from './bachs'
export type { BachsPlatformBalance, BachsCreateTransferOpts } from './bachs'

const SUPPORTED = new Set(['paystack', 'bachs'])

export function getActivePaymentProvider(): PaymentProvider {
  const active = env.ACTIVE_PAYMENT_PROVIDER

  if (!SUPPORTED.has(active)) {
    throw new Error(
      `Unsupported payment provider: "${active}". Supported: ${[...SUPPORTED].join(', ')}`,
    )
  }

  switch (active) {
    case 'paystack': {
      if (!env.PAYSTACK_SECRET_KEY) {
        throw new Error('PAYSTACK_SECRET_KEY is required when ACTIVE_PAYMENT_PROVIDER=paystack')
      }
      return new Paystack(env.PAYSTACK_SECRET_KEY)
    }
    case 'bachs': {
      const key = env.NODE_ENV === 'production' ? env.BACHS_LIVE_KEY : env.BACHS_TEST_KEY
      if (!key) {
        throw new Error(
          'BACHS_TEST_KEY or BACHS_LIVE_KEY is required when ACTIVE_PAYMENT_PROVIDER=bachs',
        )
      }
      return new Bachs(key)
    }
    default:
      throw new Error(`Unsupported payment provider: "${active}"`)
  }
}

export function getBachsInstance(): Bachs {
  const key = env.NODE_ENV === 'production' ? env.BACHS_LIVE_KEY : env.BACHS_TEST_KEY
  if (!key) throw new Error('Bachs API key is not configured')
  return new Bachs(key)
}
