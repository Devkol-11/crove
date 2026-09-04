import { Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QUEUE_NAMES } from '../index'
import { db } from '../../lib/prisma'
import { log } from '../../lib/logger'
import { getActivePaymentProvider } from '../../third_party/payment_providers'
import type { VerifyPaymentResult } from '../../third_party/payment_providers'
import { appendLedgerEntry } from '../../modules/escrow/domain/helpers/ledger.helper'
import { appendEscrowEvent } from '../../modules/escrow/domain/helpers/escrow-event.helper'
import { LedgerEntryType } from '../../modules/escrow/escrow.types'
import { EscrowFundedEvent } from '../../modules/escrow/domain/events/escrow-funded.event'
import { eventDispatcher } from '../../lib/event-dispatcher'

const workerLog = log.worker.payment

export const PAYMENT_JOBS = {
  CONFIRM_PAYMENT: 'payment.confirm',
} as const

interface ConfirmPaymentPayload {
  /** Our internal payment reference — used to look up the Payment record */
  reference: string
  /** Provider event ID (Bachs: evt_...) — used to look up the InboundWebhook record */
  eventId?: string
}

// Thrown inside the DB transaction when the escrow is no longer in a fundable state
// at write time (TOCTOU race). Caught outside to avoid a BullMQ retry.
class EscrowNotFundableError extends Error {
  constructor() {
    super('escrow not in a fundable state at write time')
    this.name = 'EscrowNotFundableError'
  }
}

const FUNDABLE_ESCROW_STATUSES = ['Created', 'AwaitingPayment'] as const

export function startPaymentWorker(redis: Redis) {
  const worker = new Worker<ConfirmPaymentPayload>(
    QUEUE_NAMES.PAYMENT,
    async (job) => {
      if (job.name !== PAYMENT_JOBS.CONFIRM_PAYMENT) {
        workerLog.warn({ jobName: job.name }, 'unhandled payment job — skipped')
        return
      }

      const { reference, eventId } = job.data

      const payment = await db.payment.findUnique({ where: { reference } })
      if (!payment) {
        workerLog.warn({ reference }, 'payment record not found — skipped')
        return
      }

      // ── Payment status guard ────────────────────────────────────────────────

      if (payment.status === 'Completed') {
        workerLog.info({ reference }, 'payment already completed — idempotent skip')
        return
      }

      // A success job for a terminal payment (Failed or Expired) is a data inconsistency
      // or a replay attack. Do not proceed under any circumstances.
      if (payment.status === 'Failed' || payment.status === 'Expired') {
        workerLog.error(
          { reference, status: payment.status },
          'payment.success job received for a terminal payment — possible replay or data inconsistency, refusing to process',
        )
        return
      }

      // Processing means another worker instance may be handling this job concurrently.
      if (payment.status === 'Processing') {
        workerLog.warn({ reference }, 'payment already in Processing state — possible duplicate job, skipping')
        return
      }

      // At this point payment.status must be 'Pending' — the only valid entry state.

      // ── Provider verification ───────────────────────────────────────────────
      //
      // Bachs: the HMAC-verified `collection.succeeded` webhook IS the fulfilment
      // signal per Bachs docs. No separate API call is needed or available.
      //
      // Paystack: double-check with the provider API before touching anything.
      let verification: VerifyPaymentResult
      if (payment.provider === 'bachs') {
        verification = {
          status:      'success',
          amount:      Number(payment.amount),
          currency:    payment.currency,
          reference:   payment.reference,
          providerRef: eventId ?? reference,
        }
      } else {
        try {
          const provider = getActivePaymentProvider()
          verification = await provider.verifyPayment(reference)
        } catch (err) {
          workerLog.error({ reference, err: (err as Error).message }, 'provider verifyPayment threw')
          throw err // let BullMQ retry
        }
      }

      if (verification.status !== 'success') {
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'Failed', providerRef: verification.providerRef },
        })
        workerLog.warn(
          { reference, status: verification.status },
          'payment not successful — marked Failed',
        )
        return
      }

      // ── Money validation ────────────────────────────────────────────────────
      //
      // Validate the verified amount and currency against our payment record.
      // For Bachs, the synthetic verification is built from payment.amount /
      // payment.currency, so these checks are tautological but kept for uniformity.
      // For Paystack, the values come from the external API and MUST match.

      if (verification.amount <= 0) {
        await db.payment.update({ where: { id: payment.id }, data: { status: 'Failed' } })
        workerLog.error(
          { reference, amount: verification.amount },
          'provider returned non-positive amount — payment marked Failed',
        )
        return
      }

      // Paystack returns amounts in kobo (minor units); our payment record stores NGN (major).
      // Bachs synthetic verification already builds amount in major units, so no conversion needed.
      const expectedAmount =
        payment.provider === 'paystack'
          ? Math.round(Number(payment.amount) * 100)
          : Number(payment.amount)

      if (verification.amount !== expectedAmount) {
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'Failed', providerRef: verification.providerRef },
        })
        workerLog.error(
          { reference, expected: expectedAmount, received: verification.amount, provider: payment.provider },
          'amount mismatch between payment record and provider — payment marked Failed',
        )
        return
      }

      if (verification.currency.toUpperCase() !== payment.currency.toUpperCase()) {
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'Failed', providerRef: verification.providerRef },
        })
        workerLog.error(
          { reference, expected: payment.currency, received: verification.currency },
          'currency mismatch between payment record and provider — payment marked Failed',
        )
        return
      }

      // ── Escrow pre-flight ───────────────────────────────────────────────────

      const escrow = await db.escrow.findUnique({ where: { id: payment.escrowId } })
      if (!escrow) {
        workerLog.error({ reference, escrowId: payment.escrowId }, 'escrow not found for payment')
        return
      }

      if (escrow.expiresAt && escrow.expiresAt < new Date()) {
        await db.payment.update({ where: { id: payment.id }, data: { status: 'Failed' } })
        workerLog.warn(
          { reference, escrowId: escrow.id, expiresAt: escrow.expiresAt },
          'escrow has expired — payment marked Failed',
        )
        return
      }

      if (!FUNDABLE_ESCROW_STATUSES.includes(escrow.status as typeof FUNDABLE_ESCROW_STATUSES[number])) {
        // The escrow is past the fundable window. The payment was successful at the
        // provider level but can't be applied — leave a clear log for reconciliation.
        await db.payment.update({ where: { id: payment.id }, data: { status: 'Failed' } })
        workerLog.warn(
          { reference, escrowId: escrow.id, status: escrow.status },
          'escrow already past fundable state — payment marked Failed for reconciliation',
        )
        return
      }

      // ── Atomic fund ─────────────────────────────────────────────────────────
      //
      // The escrow.updateMany inside the transaction is the authoritative gate:
      // it only succeeds if escrow.status is still fundable at write time.
      // This closes the TOCTOU window between the pre-flight check above and this write.
      //
      // If EscrowNotFundableError is thrown, the entire transaction rolls back and
      // we mark the payment Failed without retrying.
      try {
        await db.$transaction(async (tx) => {
          // Conditional update — atomic check-and-set. If count === 0, the escrow
          // was claimed by a concurrent process between the pre-flight and now.
          // Go directly to Held: Funded is a transient state that exists only for
          // audit purposes — the worker never leaves an escrow resting in Funded.
          const escrowUpdate = await tx.escrow.updateMany({
            where: { id: payment.escrowId, status: { in: [...FUNDABLE_ESCROW_STATUSES] } },
            data:  { status: 'Held', fundedAt: new Date() },
          })
          if (escrowUpdate.count === 0) throw new EscrowNotFundableError()

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status:      'Completed',
              providerRef: verification.providerRef,
            },
          })

          await appendLedgerEntry(tx as typeof db, {
            escrowId:    payment.escrowId,
            type:        LedgerEntryType.Funding,
            amount:      Number(payment.amount),
            currency:    payment.currency,
            description: `Escrow funded via ${payment.provider} (ref: ${reference})`,
            reference:   `LDG-${reference}`,
          })

          await tx.escrowTransaction.updateMany({
            where: { providerRef: reference, status: 'Pending' },
            data:  { status: 'Completed' },
          })

          await appendEscrowEvent(
            tx as typeof db,
            payment.escrowId,
            'StatusChangedToHeld',
            'system',
            { reference, provider: payment.provider },
          )
        })
      } catch (err) {
        if (err instanceof EscrowNotFundableError) {
          await db.payment.update({
            where: { id: payment.id },
            data:  { status: 'Failed' },
          })
          workerLog.warn(
            { reference, escrowId: payment.escrowId },
            'escrow claimed by concurrent process before write — payment marked Failed',
          )
          return
        }
        throw err // unexpected — let BullMQ retry
      }

      // ── Post-fund: webhook + event ──────────────────────────────────────────

      const webhookLookupKey = eventId ?? reference
      await db.inboundWebhook.updateMany({
        where: { reference: webhookLookupKey },
        data:  { processedAt: new Date() },
      })

      const payerParticipant = await db.escrowParticipant.findFirst({
        where: { escrowId: payment.escrowId, role: 'Payer' },
      })

      if (!payerParticipant?.userId) {
        workerLog.warn(
          { escrowId: payment.escrowId },
          'no payer participant with userId found — EscrowFundedEvent not dispatched',
        )
      } else {
        await eventDispatcher.dispatch(
          new EscrowFundedEvent(
            payment.escrowId,
            payerParticipant.userId,
            Number(payment.amount),
            payment.currency,
          ),
        )
      }

      workerLog.info({ reference, escrowId: payment.escrowId }, 'payment confirmed — escrow held')
    },
    { connection: redis },
  )

  worker.on('ready', () => {
    workerLog.info({ queue: QUEUE_NAMES.PAYMENT }, 'worker connected and listening')
  })

  worker.on('error', (err) => {
    workerLog.error({ err: err.message }, 'worker connection error')
  })

  worker.on('completed', (job) => {
    workerLog.info({ jobId: job.id, jobName: job.name }, 'job completed')
  })

  worker.on('failed', (job, err) => {
    workerLog.error({ jobId: job?.id, jobName: job?.name, err: err.message }, 'job failed')
  })

  return worker
}
