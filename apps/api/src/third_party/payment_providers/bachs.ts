import type { PaymentProvider, InitiatePaymentParams, PaymentInitiationResult, VerifyPaymentResult } from './types'
import { PaymentError } from './payment.error'

const TIMEOUT_MS = 10_000

function baseUrl(key: string): string {
  return key.startsWith('sk_live_') ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io'
}

export interface BachsPlatformBalance {
  availableBalance: number
  pendingBalance: number
  currency: string
  pendingSettlementsByDay: Array<{ date: string; amount: number }>
}

export interface BachsCapabilityEntry {
  name: string
  status: 'active' | 'restricted' | 'pending' | 'unrequested' | 'unsupported'
  requested: boolean
  status_details: Array<{ code: string; resolution: string | null; message: string | null }> | null
}

export interface BachsAccountCapabilities {
  items: BachsCapabilityEntry[]
}

export interface BachsCreateRefundOpts {
  chargeId: string      // ch_xxx — from collection.succeeded webhook
  reference: string     // our unique internal reference for idempotency
  amount?: string       // decimal string; omit for full refund
  reason?: string
  idempotencyKey?: string
}

export interface BachsRefundResult {
  refundId: string
  chargeId: string
  reference: string
  status: 'processing' | 'success' | 'failed'
  requestedAmount: string
  refundedAmount: string | null
  createdAt: string
}

export interface BachsCreateTransferOpts {
  amount: number // decimal amount (e.g. 150000 for ₦150,000)
  currency: string
  destinationAccountId: string // Bachs Connect acct_xxx
  idempotencyKey: string
  description?: string
  metadata?: Record<string, string>
}

export class Bachs implements PaymentProvider {
  private readonly base: string

  constructor(private readonly key: string) {
    this.base = baseUrl(key)
  }

  // ── Shared request helper ─────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      const isTimeout = (err as Error).name === 'AbortError'
      throw new PaymentError(
        isTimeout ? `Bachs ${method} ${path} timed out after 10s` : `Bachs ${method} ${path} failed — network error`,
        'bachs',
        undefined,
        undefined,
        err,
      )
    }
    clearTimeout(timeoutId)

    const text = await res.text()

    if (!res.ok) {
      throw new PaymentError(`Bachs ${method} ${path} failed`, 'bachs', res.status, text)
    }

    let val: T
    try {
      val = JSON.parse(text) as T
    } catch (error) {
      throw new PaymentError(`Bachs returned unparseable response for ${method} ${path}`, 'bachs', res.status, text)
    }

    return val
  }

  // ── PaymentProvider interface ─────────────────────────────────────────────

  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitiationResult> {
    const amount = (params.amount / 100).toFixed(2)
    const customerName = params.customerName ?? params.email.split('@')[0]

    const json = await this.request<{ checkout_id: string; checkout_url: string }>('POST', '/v1/checkout-sessions', {
      customer:    { email: params.email, name: customerName },
      pricing:     { currency: params.currency, amount },
      reference:   params.reference,
      success_url: params.callbackUrl,
      cancel_url:  params.callbackUrl,
      ...(params.metadata            ? { metadata:              params.metadata            } : {}),
      ...(params.paymentMethodTypes?.length ? { payment_method_types: params.paymentMethodTypes } : {}),
    })

    return {
      authorizationUrl: json.checkout_url,
      providerRef: json.checkout_id,
    }
  }

  verifyPayment(_reference: string): Promise<VerifyPaymentResult> {
    throw new Error('Bachs verifyPayment is not yet implemented')
  }

  // ── Bachs Connect — account management ────────────────────────────────────

  async createConnectAccount(email: string, displayName: string): Promise<string> {
    const endpoint = '/v1/accounts'
    const payload = (payloadEmail: string, payloadName: string) => {
      return {
        contact_email: payloadEmail,
        display_name: payloadName,
        country: 'NG',
        entity_type: 'individual',
        configuration: {
          recipient: {
            capabilities: {
              transfers: {
                requested: true,
              },
              payouts: {
                requested: true,
              },
            },
          },
        },
      }
    }

    const json = await this.request<{ id: string }>('POST', endpoint, payload(email, displayName))
    return json.id
  }

  async setupPayeeAccount(
    accountId: string,
    opts: {
      balanceCurrencies: string[]
      payoutDestination:
        | {
            type: 'bank_account'
            accountNumber: string
            accountName: string
            bankCode: string
            currency: string
          }
        | {
            type: 'crypto_wallet'
            network: 'USDT_TRC20' | 'USDT_BEP20'
            address: string
          }
    },
  ): Promise<void> {
    const balanceCurrencyMap = Object.fromEntries(opts.balanceCurrencies.map((c) => [c, true]))

    const dest = opts.payoutDestination
    const payoutDestinationPayload =
      dest.type === 'bank_account'
        ? {
            type:           'bank_account',
            account_number: dest.accountNumber,
            account_name:   dest.accountName,
            bank_code:      dest.bankCode,
            currency:       dest.currency,
          }
        : {
            type:    'crypto_wallet',
            currency: dest.network,  // Bachs expects the network code in the currency field
            address:  dest.address,
          }

    await this.request<unknown>('POST', `/v1/accounts/${accountId}`, {
      balance_currencies: balanceCurrencyMap,
      fields: { payout_destination: payoutDestinationPayload },
    })
  }

  // ── Bachs Connect — transfers ─────────────────────────────────────────────

  async createTransfer(opts: BachsCreateTransferOpts): Promise<{ transferId: string }> {
    const json = await this.request<{ id: string }>(
      'POST',
      '/v1/transfers',
      {
        amount: opts.amount.toFixed(2),
        currency: opts.currency,
        destination: opts.destinationAccountId,
        ...(opts.description ? { description: opts.description } : {}),
        ...(opts.metadata ? { metadata: opts.metadata } : {}),
      },
      { 'Idempotency-Key': opts.idempotencyKey },
    )
    return { transferId: json.id }
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(opts: BachsCreateRefundOpts): Promise<BachsRefundResult> {
    const json = await this.request<{
      refund_id: string
      charge_id: string
      reference: string
      status: 'processing' | 'success' | 'failed'
      requested_amount: string
      refunded_amount: string | null
      created_at: string
    }>(
      'POST',
      '/v1/refunds',
      {
        charge_id: opts.chargeId,
        reference: opts.reference,
        ...(opts.amount ? { amount: opts.amount } : {}),
        ...(opts.reason ? { reason: opts.reason } : {}),
      },
      opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {},
    )

    return {
      refundId: json.refund_id,
      chargeId: json.charge_id,
      reference: json.reference,
      status: json.status,
      requestedAmount: json.requested_amount,
      refundedAmount: json.refunded_amount,
      createdAt: json.created_at,
    }
  }

  // ── Bachs Connect — capability inspection ────────────────────────────────

  async getAccountCapabilities(accountId: string): Promise<BachsAccountCapabilities> {
    return this.request<BachsAccountCapabilities>('GET', `/v1/accounts/${accountId}/capabilities`)
  }

  // ── Bachs Connect — platform balance ─────────────────────────────────────

  async getPlatformBalance(): Promise<BachsPlatformBalance> {
    const json = await this.request<{
      available_balance: string
      pending_balance: string
      currency: string
      pending_settlements_by_day?: Array<{ date: string; amount: string }>
    }>('GET', '/v1/balances')

    return {
      availableBalance: parseFloat(json.available_balance),
      pendingBalance: parseFloat(json.pending_balance),
      currency: json.currency,
      pendingSettlementsByDay: (json.pending_settlements_by_day ?? []).map((s) => ({
        date: s.date,
        amount: parseFloat(s.amount),
      })),
    }
  }
}
