import type {
  PaymentProvider,
  InitiatePaymentParams,
  PaymentInitiationResult,
  VerifyPaymentResult,
} from './types'
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

export interface BachsCreateTransferOpts {
  amount: number          // decimal amount (e.g. 150000 for ₦150,000)
  currency: string
  destinationAccountId: string  // Bachs Connect acct_xxx
  reference: string
  idempotencyKey: string
  description?: string
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
        isTimeout
          ? `Bachs ${method} ${path} timed out after 10s`
          : `Bachs ${method} ${path} failed — network error`,
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

    try {
      return JSON.parse(text) as T
    } catch {
      throw new PaymentError(
        `Bachs returned unparseable response for ${method} ${path}`,
        'bachs',
        res.status,
        text,
      )
    }
  }

  // ── PaymentProvider interface ─────────────────────────────────────────────

  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitiationResult> {
    const amount = (params.amount / 100).toFixed(2)
    const customerName = params.customerName ?? params.email.split('@')[0]

    const json = await this.request<{ checkout_id: string; checkout_url: string }>(
      'POST',
      '/v1/checkout-sessions',
      {
        customer: { email: params.email, name: customerName },
        pricing: { currency: params.currency, amount, price_type: 'fixed' },
        reference: params.reference,
      },
    )

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
    const json = await this.request<{ id: string }>(
      'POST',
      '/v1/accounts',
      { email, display_name: displayName },
    )
    return json.id
  }

  async setupPayeeAccount(
    accountId: string,
    opts: {
      balanceCurrencies: string[]
      payoutDestination: {
        type: 'bank_account'
        accountNumber: string
        accountName: string
        bankCode: string
        currency: string
      }
      persons?: Array<{ name: string; email: string }>
    },
  ): Promise<void> {
    await this.request<unknown>(
      'POST',
      `/v1/accounts/${accountId}`,
      {
        balance_currencies: opts.balanceCurrencies,
        fields: {
          ...(opts.persons
            ? { persons: opts.persons.map((p) => ({ name: p.name, email: p.email })) }
            : {}),
          payout_destination: {
            type: opts.payoutDestination.type,
            account_number: opts.payoutDestination.accountNumber,
            account_name: opts.payoutDestination.accountName,
            bank_code: opts.payoutDestination.bankCode,
            currency: opts.payoutDestination.currency,
          },
        },
      },
    )
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
        reference: opts.reference,
        ...(opts.description ? { description: opts.description } : {}),
      },
      { 'Idempotency-Key': opts.idempotencyKey },
    )
    return { transferId: json.id }
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
