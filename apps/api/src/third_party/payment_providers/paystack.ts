import type {
  PaymentProvider,
  InitiatePaymentParams,
  PaymentInitiationResult,
  VerifyPaymentResult,
} from './types'
import { PaymentError } from './payment.error'

const BASE = 'https://api.paystack.co'

export class Paystack implements PaymentProvider {
  constructor(private readonly secretKey: string) {}

  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitiationResult> {
    const res = await fetch(`${BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount:       params.amount,
        currency:     params.currency,
        email:        params.email,
        reference:    params.reference,
        callback_url: params.callbackUrl,
        metadata:     params.metadata ?? {},
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new PaymentError('Paystack payment initiation failed', 'paystack', res.status, body)
    }

    const json = (await res.json()) as {
      data: { authorization_url: string; access_code: string; reference: string }
    }

    return {
      authorizationUrl: json.data.authorization_url,
      accessCode:       json.data.access_code,
      providerRef:      json.data.reference,
    }
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const res = await fetch(
      `${BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    )

    if (!res.ok) {
      const body = await res.text()
      throw new PaymentError('Paystack payment verification failed', 'paystack', res.status, body)
    }

    const json = (await res.json()) as {
      data: {
        status:    string
        amount:    number
        currency:  string
        reference: string
        id:        number
        paid_at?:  string
        metadata?: Record<string, unknown>
      }
    }

    const d = json.data
    return {
      status:      d.status === 'success' ? 'success' : d.status === 'failed' ? 'failed' : 'pending',
      amount:      d.amount,
      currency:    d.currency,
      reference:   d.reference,
      providerRef: String(d.id),
      paidAt:      d.paid_at ? new Date(d.paid_at) : undefined,
      metadata:    d.metadata,
    }
  }
}
