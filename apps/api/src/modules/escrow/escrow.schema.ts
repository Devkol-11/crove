import { z } from 'zod'
import { EscrowType, EscrowStatus, EscrowRole } from './escrow.types'

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const milestoneInputSchema = z.object({
  title:       z.string().min(1),
  description: z.string().optional(),
  amount:      z.number().positive(),
  deadline:    z.string().datetime().optional(),
})

const creatorRoleSchema = z.nativeEnum(EscrowRole, {
  errorMap: () => ({ message: 'creatorRole must be "Payer" or "Payee"' }),
})

// ── Full escrow creation (requires auth) ──────────────────────────────────────

export const createEscrowSchema = z.discriminatedUnion('type', [
  z.object({
    type:           z.literal(EscrowType.Standard),
    title:          z.string().min(1),
    description:    z.string().optional(),
    amount:         z.number().positive(),
    currency:       z.string().default('NGN'),
    creatorRole:    creatorRoleSchema,
    expiresInDays:  z.number().int().min(1).max(365).optional(),
    recipientEmail: z.string().email().optional(),
  }),
  z.object({
    type:           z.literal(EscrowType.Milestone),
    title:          z.string().min(1),
    description:    z.string().optional(),
    currency:       z.string().default('NGN'),
    creatorRole:    creatorRoleSchema,
    expiresInDays:  z.number().int().min(1).max(365).optional(),
    milestones:     z.array(milestoneInputSchema).min(1),
    recipientEmail: z.string().email().optional(),
  }),
  z.object({
    type:             z.literal(EscrowType.Conditional),
    title:            z.string().min(1),
    description:      z.string().optional(),
    amount:           z.number().positive(),
    currency:         z.string().default('NGN'),
    creatorRole:      creatorRoleSchema,
    expiresInDays:    z.number().int().min(1).max(365).optional(),
    releaseCondition: z.string().min(1, 'A release condition is required'),
    recipientEmail:   z.string().email().optional(),
  }),
  z.object({
    type:           z.literal(EscrowType.Deposit),
    title:          z.string().min(1),
    description:    z.string().optional(),
    amount:         z.number().positive(),
    currency:       z.string().default('NGN'),
    creatorRole:    creatorRoleSchema,
    expiresInDays:  z.number().int().min(1).max(365).optional(),
    recipientEmail: z.string().email().optional(),
  }),
])

export type CreateEscrowInput = z.infer<typeof createEscrowSchema>

// ── Quick link escrow creation (no auth required) ─────────────────────────────
// Always Standard type. Creator declares whether they are the Payer or Payee.

export const createQuickEscrowSchema = z.object({
  title:         z.string().min(1, 'Title is required'),
  description:   z.string().optional(),
  amount:        z.number().positive('Amount must be positive'),
  currency:      z.string().default('NGN'),
  creatorName:   z.string().min(1, 'Your name is required'),
  creatorEmail:  z.string().email('A valid email is required'),
  creatorRole:   creatorRoleSchema,
  expiresInDays: z.number().int().min(1).max(90).default(7),
})

export type CreateQuickEscrowInput = z.infer<typeof createQuickEscrowSchema>

// ── Quick link recipient join — OTP flow ──────────────────────────────────────

export const joinRequestSchema = z.object({
  name:  z.string().min(1, 'Your name is required'),
  email: z.string().email('A valid email is required'),
})

export type JoinRequestInput = z.infer<typeof joinRequestSchema>

export const joinVerifySchema = z.object({
  email: z.string().email(),
  otp:   z.string().length(6, 'OTP must be 6 digits'),
})

export type JoinVerifyInput = z.infer<typeof joinVerifySchema>

// ── Disputes ──────────────────────────────────────────────────────────────────

export const openDisputeSchema = z.object({
  reason: z.string().min(10, 'Please provide a detailed reason (min 10 characters)'),
})
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>

export const resolveDisputeSchema = z.object({
  resolution: z.string().min(10, 'Please provide a detailed resolution (min 10 characters)'),
})
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>

// ── Milestones ────────────────────────────────────────────────────────────────

export const submitMilestoneSchema = z.object({
  milestoneId: z.string().cuid(),
})
export type SubmitMilestoneInput = z.infer<typeof submitMilestoneSchema>

export const approveMilestoneSchema = z.object({
  milestoneId: z.string().cuid(),
})
export type ApproveMilestoneInput = z.infer<typeof approveMilestoneSchema>
