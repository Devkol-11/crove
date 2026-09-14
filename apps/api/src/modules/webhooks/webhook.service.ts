import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { env } from '../../config'
import {
  verifyPaystackWebhook,
  verifyBachsWebhook,
} from '../../third_party/payment_providers/webhook-verification'
import type { WebhookVerificationResult } from '../../third_party/payment_providers/types'
import { getQueues } from '../../pub_sub'
import { PAYMENT_JOBS } from '../../pub_sub/workers/payment.worker'
import { appendEscrowEvent } from '../escrow/domain/helpers/escrow-event.helper'
import { log } from '../../lib/logger'

const webhookLog = log.config

type Headers = Record<string, string | string[] | undefined>

// Identifies the payment provider from the inbound request headers.
// Each provider stamps its own signature header — no body parsing needed.
function detectProvider(headers: Headers): 'bachs' | 'paystack' | null {
  if (headers['x-bachs-signature']) return 'bachs'
  if (headers['x-paystack-signature']) return 'paystack'
  return null
}

// ── Dispatch table ────────────────────────────────────────────────────────────
// Each entry is a function that verifies the payload and returns a normalised result.
// Adding a new provider = adding one entry here + a verify function.

type ProviderHandler = (
  rawBody: Buffer,
  headers: Headers,
  service: WebhookService,
) => Promise<{ received: true }>

const PROVIDER_HANDLERS: Record<string, ProviderHandler> = {
  bachs: (body, headers, svc) => svc.handleBachsWebhook(body, headers),
  paystack: (body, headers, svc) => svc.handlePaystackWebhook(body, headers),
}

export class WebhookService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  // ── Entry point ─────────────────────────────────────────────────────────────

  async handlePaymentWebhook(rawBody: Buffer, headers: Headers): Promise<{ received: true }> {
    const provider = detectProvider(headers)

    if (!provider) {
      webhookLog.warn('Webhook received with no recognisable provider signature header — rejected')
      throw this.app.httpErrors.badRequest('Unrecognised webhook provider')
    }

    const handler = PROVIDER_HANDLERS[provider]
    return handler(rawBody, headers, this)
  }

  // ── Per-provider handlers ────────────────────────────────────────────────────

  async handleBachsWebhook(rawBody: Buffer, headers: Headers): Promise<{ received: true }> {
    const secret =
      env.NODE_ENV === 'production' ? env.BACHS_LIVE_WH_SECRET : env.BACHS_TEST_WH_SECRET

    if (!secret) {
      webhookLog.error('Bachs webhook secret is not configured — cannot verify signature')
      throw this.app.httpErrors.internalServerError('Bachs webhook secret not configured')
    }

    const result = verifyBachsWebhook(rawBody, headers, secret)

    if (!result.isValid) {
      webhookLog.warn('Bachs webhook signature verification failed')
      throw this.app.httpErrors.unauthorized('Invalid Bachs webhook signature')
    }

    return this.processVerifiedPayload(result, 'bachs')
  }

  async handlePaystackWebhook(rawBody: Buffer, headers: Headers): Promise<{ received: true }> {
    const secret = env.PAYSTACK_SECRET_KEY

    if (!secret) {
      webhookLog.error('Paystack secret key is not configured — cannot verify signature')
      throw this.app.httpErrors.internalServerError('Paystack secret key not configured')
    }

    const result = verifyPaystackWebhook(rawBody, headers, secret)

    if (!result.isValid) {
      webhookLog.warn('Paystack webhook signature verification failed')
      throw this.app.httpErrors.unauthorized('Invalid Paystack webhook signature')
    }

    return this.processVerifiedPayload(result, 'paystack')
  }

  // ── Common post-verification logic ───────────────────────────────────────────
  // Called after any provider handler confirms the signature is valid.

  private async processVerifiedPayload(
    result: WebhookVerificationResult,
    provider: string,
  ): Promise<{ received: true }> {
    if (result.normalizedEvent === 'unknown') {
      webhookLog.info(
        { provider, eventType: result.eventType },
        'webhook received — unrecognised event type, acknowledged',
      )
      return { received: true }
    }

    // Bachs deduplicates on the envelope `id` (evt_...).
    // Paystack does not send an eventId, so we fall back to the payment reference.
    const dedupKey = result.eventId ?? result.reference

    // Fast-path duplicate check
    const existing = await this.db.inboundWebhook.findUnique({
      where: { reference: dedupKey },
    })

    if (existing) {
      webhookLog.info({ provider, dedupKey }, 'duplicate webhook — already processed, acknowledged')
      return { received: true }
    }

    // Persist the raw webhook. Unique constraint on `reference` is the race-safe gate.
    try {
      await this.db.inboundWebhook.create({
        data: {
          provider,
          eventType: result.eventType,
          reference: dedupKey,
          rawPayload: result.data as object,
        },
      })
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        // Concurrent duplicate — unique constraint caught the race
        webhookLog.info({ provider, dedupKey }, 'concurrent duplicate webhook — ignored')
        return { received: true }
      }
      throw err
    }

    // ── Dispatch to processing jobs ──────────────────────────────────────────

    if (result.normalizedEvent === 'payment.success') {
      const { paymentQueue } = getQueues()
      await paymentQueue?.add(
        PAYMENT_JOBS.CONFIRM_PAYMENT,
        {
          reference: result.reference,
          eventId: result.eventId,
          chargeId: result.data.charge_id as string | undefined,
        },
        { jobId: `confirm_${dedupKey.replace(/:/g, '_')}` },
      )
      webhookLog.info(
        { provider, reference: result.reference, eventId: result.eventId, chargeId: result.data.charge_id },
        'payment.success webhook — confirm job enqueued',
      )
    }

    if (result.normalizedEvent === 'payment.failed') {
      await this.db.payment.updateMany({
        where: { reference: result.reference },
        data: { status: 'Failed' },
      })
      await this.db.inboundWebhook.updateMany({
        where: { reference: dedupKey },
        data: { processedAt: new Date() },
      })
      webhookLog.info(
        { provider, reference: result.reference },
        'payment.failed webhook — payment marked Failed',
      )
    }

    if (result.normalizedEvent === 'connect.transfer_created') {
      // Bachs transfer objects have no echoed reference field — link back to
      // the escrow via the transferId stored in the PayoutInitiated event metadata.
      const transferId = result.data.id as string | undefined

      if (transferId) {
        const payoutEvent = await this.db.escrowEvent.findFirst({
          where: {
            type: 'PayoutInitiated',
            metadata: { path: ['transferId'], equals: transferId },
          },
        })

        if (payoutEvent) {
          await appendEscrowEvent(this.db, payoutEvent.escrowId, 'PayoutConfirmed', 'system', {
            transferId,
            transferStatus: result.data.status as string | undefined,
          })
          webhookLog.info(
            { escrowId: payoutEvent.escrowId, transferId },
            'connect.transfer_created — PayoutConfirmed appended',
          )
        } else {
          webhookLog.warn(
            { transferId },
            'connect.transfer_created — no matching PayoutInitiated event found',
          )
        }
      }

      await this.db.inboundWebhook.updateMany({
        where: { reference: dedupKey },
        data: { processedAt: new Date() },
      })
    }

    if (result.normalizedEvent === 'connect.capability_updated') {
      webhookLog.info(
        { provider, eventId: result.eventId, accountId: result.data.account_id },
        'connect.capability_updated — acknowledged',
      )
      await this.db.inboundWebhook.updateMany({
        where: { reference: dedupKey },
        data: { processedAt: new Date() },
      })
    }

    if (result.normalizedEvent === 'connect.account_updated') {
      webhookLog.info(
        { provider, eventId: result.eventId, accountId: result.data.id },
        'connect.account_updated — acknowledged',
      )
      await this.db.inboundWebhook.updateMany({
        where: { reference: dedupKey },
        data: { processedAt: new Date() },
      })
    }

    if (result.normalizedEvent === 'refund.paid' || result.normalizedEvent === 'refund.failed') {
      const chargeId = result.data.charge_id as string | undefined
      const refundId = result.data.refund_id as string | undefined
      const succeeded = result.normalizedEvent === 'refund.paid'

      // Find the payment by chargeId to get the escrowId
      if (chargeId) {
        const payment = await this.db.payment.findFirst({ where: { chargeId } })
        if (payment) {
          await appendEscrowEvent(
            this.db,
            payment.escrowId,
            succeeded ? 'RefundConfirmed' : 'RefundFailed',
            'system',
            { refundId, chargeId },
          )
          webhookLog.info(
            { escrowId: payment.escrowId, refundId, chargeId, succeeded },
            `${result.normalizedEvent} — escrow event appended`,
          )
        } else {
          webhookLog.warn({ chargeId, refundId }, `${result.normalizedEvent} — no payment found for chargeId`)
        }
      }

      await this.db.inboundWebhook.updateMany({
        where: { reference: dedupKey },
        data: { processedAt: new Date() },
      })
    }

    return { received: true }
  }
}
