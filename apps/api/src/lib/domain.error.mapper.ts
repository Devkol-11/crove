import type { FastifyInstance } from 'fastify'
import {
  DomainError,
  DomainValidationError,
  DomainAuthorizationError,
} from '../shared/domain/domain.error'

export function mapDomainError(err: unknown, app: FastifyInstance): never {
  if (err instanceof DomainAuthorizationError)
    throw app.httpErrors.forbidden(err.message)
  if (err instanceof DomainValidationError)
    throw app.httpErrors.badRequest(err.message)
  // Safety net: a DomainError subclass that wasn't added to this mapper
  if (err instanceof DomainError)
    throw app.httpErrors.badRequest(err.message)
  // Truly unexpected — not a domain error at all
  throw app.httpErrors.internalServerError('An unexpected error occurred.')
}
