import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { log } from './logger'

const dbLog = log.db

// Returns true if the error is already an HTTP error thrown by service-layer business
// logic (domain validation, aggregate assertions, etc.) — those must pass through
// unchanged so the caller sees the intended status code and message.
function isHttpError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as Record<string, unknown>).statusCode === 'number'
  )
}

// Extracts the constraint target from Prisma P2002 meta for a readable error message.
// meta.target is string[] on Postgres ("email", "phone") and string on some other drivers.
function uniqueTarget(meta: Record<string, unknown> | undefined): string {
  if (!meta?.target) return 'field'
  if (Array.isArray(meta.target)) return (meta.target as string[]).join(' and ')
  return String(meta.target)
}

/**
 * Wraps any Prisma database operation and maps every known error class to a
 * clean, user-facing HTTP error. All services should call DB operations through
 * this wrapper — it is the single place where Prisma errors are handled.
 *
 * Usage:
 *   return withDbErrorHandler(() => db.user.findUnique({ where: { id } }), app)
 */
export async function withDbErrorHandler<T>(
  operation: () => Promise<T>,
  app: FastifyInstance,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    // ── Pass-through: already an HTTP error from domain/business logic ────────
    if (isHttpError(error)) throw error

    // ── PrismaClientKnownRequestError — DB rejected the query ─────────────────
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = error.meta as Record<string, unknown> | undefined

      switch (error.code) {
        // Unique constraint violated (duplicate email, phone, reference, etc.)
        case 'P2002':
          throw app.httpErrors.conflict(
            `This ${uniqueTarget(meta)} is already in use. Please use a different value.`,
          )

        // Foreign key constraint — referenced row does not exist
        case 'P2003':
          throw app.httpErrors.badRequest(
            'The referenced record does not exist. Please check your input.',
          )

        // Null constraint — required column received null
        case 'P2011':
          throw app.httpErrors.badRequest(
            `A required field is missing: ${meta?.constraint ?? 'unknown field'}.`,
          )

        // Required relation violated
        case 'P2014':
          throw app.httpErrors.badRequest(
            'This operation would break a required relationship between records.',
          )

        // Related record not found
        case 'P2015':
          throw app.httpErrors.notFound(
            'A related record required for this operation was not found.',
          )

        // Record to update or delete was not found
        case 'P2025':
          throw app.httpErrors.notFound(
            (meta?.cause as string | undefined) ?? 'The requested record was not found.',
          )

        // Value too long for column
        case 'P2000':
          throw app.httpErrors.badRequest(
            `The provided value is too long for the field: ${meta?.column_name ?? 'unknown'}.`,
          )

        // Value out of range for the field type
        case 'P2020':
          throw app.httpErrors.badRequest(
            `The provided value is out of the allowed range for: ${meta?.field_name ?? 'unknown'}.`,
          )

        // Connection pool timed out — DB under pressure
        case 'P2024':
          dbLog.warn({ code: error.code }, 'database connection pool timeout')
          throw app.httpErrors.serviceUnavailable(
            'The request took too long. Please try again in a moment.',
          )

        // Transaction write conflict or deadlock — safe to retry
        case 'P2034':
          dbLog.warn({ code: error.code }, 'transaction write conflict or deadlock')
          throw app.httpErrors.conflict(
            'A conflict occurred while saving. Please try again.',
          )

        default:
          dbLog.error({ code: error.code, meta }, 'unhandled prisma known error')
          throw app.httpErrors.internalServerError(
            'A database error occurred. Please try again.',
          )
      }
    }

    // ── PrismaClientUnknownRequestError — DB error with no known code ─────────
    if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      dbLog.error({ err: error.message }, 'prisma unknown request error')
      throw app.httpErrors.internalServerError('An unexpected database error occurred.')
    }

    // ── PrismaClientInitializationError — can't reach the database ───────────
    if (error instanceof Prisma.PrismaClientInitializationError) {
      dbLog.error({ err: error.message }, 'database unreachable')
      throw app.httpErrors.serviceUnavailable(
        'The service is temporarily unavailable. Please try again later.',
      )
    }

    // ── PrismaClientValidationError — query built with wrong fields/types ─────
    // This is always a developer error (schema mismatch, wrong field name, etc.)
    if (error instanceof Prisma.PrismaClientValidationError) {
      dbLog.error({ err: error.message }, 'prisma validation error — schema mismatch')
      throw app.httpErrors.internalServerError('Invalid request data.')
    }

    // ── PrismaClientRustPanicError — Prisma query engine crashed ─────────────
    if (error instanceof Prisma.PrismaClientRustPanicError) {
      dbLog.error({ err: error.message }, 'prisma engine panic')
      throw app.httpErrors.internalServerError('A critical database error occurred.')
    }

    // ── Unknown error — not Prisma at all ─────────────────────────────────────
    dbLog.error({ err: (error as Error).message }, 'unexpected error in db operation')
    throw app.httpErrors.internalServerError('Something went wrong. Please try again.')
  }
}
