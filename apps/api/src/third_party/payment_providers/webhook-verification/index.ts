import crypto from 'node:crypto'
import type { WebhookVerificationResult } from '../types'

const INVALID: WebhookVerificationResult = {
  isValid: false, eventType: '', normalizedEvent: 'unknown', reference: '', data: {},
}

// ── Paystack ──────────────────────────────────────────────────────────────────

export function verifyPaystackWebhook(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  secretKey: string,
): WebhookVerificationResult {
  const raw = headers['x-paystack-signature']
  const signature = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')

  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex')

  // Constant-time comparison prevents timing oracle attacks on the HMAC
  let signatureValid = false
  try {
    signatureValid = crypto.timingSafeEqual(
      Buffer.from(hash,      'hex'),
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return { ...INVALID }
  }
  if (!signatureValid) return { ...INVALID }

  const payload = JSON.parse(rawBody.toString()) as {
    event: string
    data:  Record<string, unknown>
  }

  const normalizedEvent: WebhookVerificationResult['normalizedEvent'] =
    payload.event === 'charge.success'
      ? 'payment.success'
      : payload.event === 'charge.failed'
        ? 'payment.failed'
        : 'unknown'

  return {
    isValid:         true,
    eventType:       payload.event,
    normalizedEvent,
    reference:       payload.data.reference as string,
    data:            payload.data,
  }
}

// ── Bachs ─────────────────────────────────────────────────────────────────────
//
// Signature: HMAC-SHA256 of "{X-Bachs-Timestamp}.{raw_body}" using the endpoint
// signing secret. Headers: X-Bachs-Timestamp (Unix seconds), X-Bachs-Signature.
// Timing tolerance: 300 s. Dedup on envelope `id` (evt_...), not payment reference.
//
// NOTE: `data.reference` is our internal payment reference echoed back by Bachs.
// This is inferred from the checkout creation contract (reference is echoed in the
// response). Verify against the collection.succeeded event schema page if behaviour
// differs: https://docs.bachs.io → Events → collection.succeeded

export function verifyBachsWebhook(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  secretKey: string,
): WebhookVerificationResult {
  const rawTimestamp = headers['x-bachs-timestamp']
  const rawSignature = headers['x-bachs-signature']
  const timestampStr = Array.isArray(rawTimestamp) ? (rawTimestamp[0] ?? '') : (rawTimestamp ?? '')
  const signature    = Array.isArray(rawSignature)  ? (rawSignature[0]  ?? '') : (rawSignature  ?? '')

  if (!timestampStr || !signature) return { ...INVALID }

  const timestamp = parseInt(timestampStr, 10)
  if (Number.isNaN(timestamp)) return { ...INVALID }

  // Reject stale deliveries older than 5 minutes
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestamp) > 300) return { ...INVALID }

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const message = `${timestamp}.${body}`
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(message, 'utf8')
    .digest('hex')

  // timingSafeEqual requires equal-length buffers — different lengths mean invalid
  let signaturesMatch = false
  try {
    signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return { ...INVALID }
  }

  if (!signaturesMatch) return { ...INVALID }

  const payload = JSON.parse(body) as {
    id:   string
    type: string
    data: Record<string, unknown>
  }

  const normalizedEvent: WebhookVerificationResult['normalizedEvent'] =
    payload.type === 'collection.succeeded'  ? 'payment.success'
    : payload.type === 'collection.failed'   ? 'payment.failed'
    : payload.type === 'transfer.created'    ? 'connect.transfer_created'
    : payload.type === 'capability.updated'  ? 'connect.capability_updated'
    : 'unknown'

  return {
    isValid:         true,
    eventType:       payload.type,
    normalizedEvent,
    eventId:         payload.id,
    reference:       (payload.data.reference as string | undefined) ?? '',
    data:            payload.data,
  }
}
