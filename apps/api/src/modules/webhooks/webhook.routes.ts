import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { WebhookService } from './webhook.service'

export default async function webhookRoutes(app: FastifyInstance) {
  const service = new WebhookService(app.db, app)

  // Override the JSON content-type parser for this plugin scope only so we
  // receive the raw Buffer — required for HMAC signature verification.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  )

  // POST /webhooks/payment
  // Payment provider sends this after a charge succeeds or fails.
  // Must return 200 quickly — actual processing is offloaded to BullMQ.
  app.post(
    '/payment',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawBody = request.body as Buffer
      const result = await service.handlePaymentWebhook(
        rawBody,
        request.headers as Record<string, string | string[] | undefined>,
      )
      return reply.send(result)
    },
  )
}
