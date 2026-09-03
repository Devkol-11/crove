import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { env } from '../../config'
import {
  verifyPaystackWebhook,
  verifyBachsWebhook,
} from '../../third_party/payment_providers/webhook-verification'
import type { WebhookVerificationResult } from '../../third_party/payment_providers/types'
import { getQueues } from '../../queues'
import { PAYMENT_JOBS } from '../../queues/workers/payment.worker'
import { log } from '../../lib/logger'

const webhookLog = log.worker.payment

export class WebhookService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  async handlePaymentWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const result = this.verifyForActiveProvider(rawBody, headers)

    if (!result.isValid) {
      throw this.app.httpErrors.unauthorized('Invalid webhook signature')
    }

    // Only act on events we understand
    if (result.normalizedEvent === 'unknown') {
      webhookLog.info({ eventType: result.eventType }, 'webhook received — unrecognised event, acknowledged')
      return { received: true }
    }

    // Bachs recommends deduplicating on the event envelope `id` (evt_...).
    // Paystack does not set eventId, so we fall back to our payment reference.
    const dedupKey = result.eventId ?? result.reference

    // Idempotency: check before inserting (fast path for duplicates)
    const existing = await this.db.inboundWebhook.findUnique({
      where: { reference: dedupKey },
    })
    if (existing) {
      webhookLog.info({ dedupKey }, 'duplicate webhook — already processed')
      return { received: true }
    }

    // Persist the raw webhook — unique constraint on reference handles any race condition
    try {
      await this.db.inboundWebhook.create({
        data: {
          provider:   env.ACTIVE_PAYMENT_PROVIDER,
          eventType:  result.eventType,
          reference:  dedupKey,
          rawPayload: result.data as object,
        },
      })
    } catch (err: unknown) {
      // P2002 = unique constraint — concurrent duplicate webhook, safe to ignore
      if ((err as { code?: string }).code === 'P2002') {
        webhookLog.info({ dedupKey }, 'concurrent duplicate webhook — ignored')
        return { received: true }
      }
      throw err
    }

    // Enqueue the confirmation job — the worker does the actual escrow funding.
    // Pass both reference (for payment lookup) and eventId (for InboundWebhook lookup).
    if (result.normalizedEvent === 'payment.success') {
      const { paymentQueue } = getQueues()
      await paymentQueue?.add(
        PAYMENT_JOBS.CONFIRM_PAYMENT,
        { reference: result.reference, eventId: result.eventId },
        { jobId: `confirm:${dedupKey}` },
      )
      webhookLog.info(
        { reference: result.reference, eventId: result.eventId },
        'payment.success webhook — confirm job enqueued',
      )
    }

    if (result.normalizedEvent === 'payment.failed') {
      await this.db.payment.updateMany({
        where: { reference: result.reference },
        data:  { status: 'Failed' },
      })
      await this.db.inboundWebhook.updateMany({
        where: { reference: dedupKey },
        data:  { processedAt: new Date() },
      })
      webhookLog.info(
        { reference: result.reference, eventId: result.eventId },
        'payment.failed webhook — payment marked Failed',
      )
    }

    return { received: true }
  }

  private verifyForActiveProvider(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerificationResult {
    switch (env.ACTIVE_PAYMENT_PROVIDER) {
      case 'paystack':
        return verifyPaystackWebhook(rawBody, headers, env.PAYSTACK_SECRET_KEY ?? '')
      case 'bachs':
        // BACHS_WEBHOOK_SECRET is the per-endpoint signing secret from the Bachs
        // Developer Portal — it is NOT the API key (BACHS_TEST_KEY / BACHS_LIVE_KEY).
        return verifyBachsWebhook(rawBody, headers, env.BACHS_WEBHOOK_SECRET ?? '')
      default:
        throw this.app.httpErrors.internalServerError(
          `No webhook verifier registered for provider: ${env.ACTIVE_PAYMENT_PROVIDER}`,
        )
    }
  }
}
