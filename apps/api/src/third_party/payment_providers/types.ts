export interface InitiatePaymentParams {
  /** Amount in the smallest currency unit (kobo for NGN, cents for USD) */
  amount: number
  currency: string
  /** Customer email — required by most providers for receipts */
  email: string
  /** Customer full name — required by some providers (e.g. Bachs); ignored by others */
  customerName?: string
  /** Your internal reference — must be unique per payment attempt */
  reference: string
  /** URL the user is redirected to after completing payment on the provider's page */
  callbackUrl: string
  metadata?: Record<string, unknown>
}

export interface PaymentInitiationResult {
  /** Redirect the user to this URL to complete payment */
  authorizationUrl: string
  /** Provider-specific short code (e.g. Paystack access_code) */
  accessCode?: string
  /** Reference echoed back by the provider — may equal our reference or differ */
  providerRef: string
}

export interface VerifyPaymentResult {
  status: 'success' | 'failed' | 'pending'
  /** Amount in the smallest currency unit */
  amount: number
  currency: string
  /** Our reference */
  reference: string
  /** Provider's internal transaction ID */
  providerRef: string
  paidAt?: Date
  metadata?: Record<string, unknown>
}

/** Returned by webhook verification functions — not part of the PaymentProvider interface */
export interface WebhookVerificationResult {
  isValid: boolean
  /** Raw provider event string (e.g. "charge.success") */
  eventType: string
  /** Normalized event — provider-agnostic, used by the webhook service */
  normalizedEvent: 'payment.success' | 'payment.failed' | 'connect.transfer_created' | 'connect.capability_updated' | 'unknown'
  /** Our internal payment reference, extracted from the webhook payload */
  reference: string
  /**
   * Provider's own event ID (e.g. Bachs "evt_...").
   * When present, the webhook service uses this as the dedup key instead of reference,
   * because Bachs recommends deduplicating on event ID, not payment reference.
   */
  eventId?: string
  data: Record<string, unknown>
}

export interface PaymentProvider {
  /** Initiate a checkout session and return the payment link */
  initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitiationResult>
  /** Confirm payment status against the provider's API */
  verifyPayment(reference: string): Promise<VerifyPaymentResult>
}
