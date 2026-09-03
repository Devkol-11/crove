import type {
  PaymentProvider,
  InitiatePaymentParams,
  PaymentInitiationResult,
  VerifyPaymentResult,
} from './types'
import { PaymentError } from './payment.error'

const TIMEOUT_MS = 10_000

function baseUrl(key: string): string {
  return key.startsWith('sk_live_')
    ? 'https://api.bachs.io'
    : 'https://sandbox-api.bachs.io'
}

export class Bachs implements PaymentProvider {
  constructor(private readonly key: string) {}

  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitiationResult> {
    const amount = (params.amount / 100).toFixed(2)
    const customerName = params.customerName ?? params.email.split('@')[0]

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(`${baseUrl(this.key)}/v1/checkout-sessions`, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${this.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer: {
            email: params.email,
            name:  customerName,
          },
          pricing: {
            currency:   params.currency,
            amount,
            price_type: 'fixed',
          },
          reference: params.reference,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      const isTimeout = (err as Error).name === 'AbortError'
      throw new PaymentError(
        isTimeout
          ? 'Bachs checkout request timed out after 10s'
          : 'Bachs checkout request failed — network error',
        'bachs',
        undefined,
        undefined,
        err,
      )
    }
    clearTimeout(timeoutId)

    const body = await res.text()

    if (!res.ok) {
      throw new PaymentError(
        'Bachs checkout session creation failed',
        'bachs',
        res.status,
        body,
      )
    }

    let json: { checkout_id: string; checkout_url: string }
    try {
      json = JSON.parse(body) as { checkout_id: string; checkout_url: string }
    } catch {
      throw new PaymentError('Bachs returned an unparseable response', 'bachs', res.status, body)
    }

    return {
      authorizationUrl: json.checkout_url,
      providerRef:      json.checkout_id,
    }
  }

  verifyPayment(_reference: string): Promise<VerifyPaymentResult> {
    throw new Error('Bachs verifyPayment is not yet implemented')
  }
}
