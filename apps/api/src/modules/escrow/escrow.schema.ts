import { z } from 'zod'
import { EscrowType, EscrowRole } from './escrow.types'

// ₦100M / $100k — absolute ceiling per escrow transaction
const MAX_ESCROW_AMOUNT = 100_000_000

// ── Shared sub-schemas ────────────────────────────────────────────────────────

export const payeeAccountSchema = z.object({
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be exactly 10 digits'),
  bankCode:      z.string().min(1, 'Bank code is required'),
  bankName:      z.string().min(1, 'Bank name is required'),
  accountName:   z.string().min(1, 'Account name is required'),
})

export type PayeeAccountInput = z.infer<typeof payeeAccountSchema>

const milestoneInputSchema = z.object({
  title:       z.string().min(1),
  description: z.string().optional(),
  amount:      z.number().positive().max(MAX_ESCROW_AMOUNT, `Milestone amount cannot exceed ${MAX_ESCROW_AMOUNT}`),
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
    amount:         z.number().positive().max(MAX_ESCROW_AMOUNT, `Amount cannot exceed ${MAX_ESCROW_AMOUNT}`),
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
    milestones:     z.array(milestoneInputSchema).min(1).max(20),
    recipientEmail: z.string().email().optional(),
    // Milestone total is validated in EscrowAggregate.assertValidCreationInput
    // since discriminatedUnion members cannot be ZodEffects (superRefine result)
  }),
  z.object({
    type:             z.literal(EscrowType.Conditional),
    title:            z.string().min(1),
    description:      z.string().optional(),
    amount:           z.number().positive().max(MAX_ESCROW_AMOUNT, `Amount cannot exceed ${MAX_ESCROW_AMOUNT}`),
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
    amount:         z.number().positive().max(MAX_ESCROW_AMOUNT, `Amount cannot exceed ${MAX_ESCROW_AMOUNT}`),
    currency:       z.string().default('NGN'),
    creatorRole:    creatorRoleSchema,
    expiresInDays:  z.number().int().min(1).max(365).optional(),
    recipientEmail: z.string().email().optional(),
  }),
])

export type CreateEscrowInput = z.infer<typeof createEscrowSchema>

// ── Quick link escrow creation (no auth required) ─────────────────────────────

export const createQuickEscrowSchema = z.object({
  title:         z.string().min(1, 'Title is required'),
  description:   z.string().optional(),
  amount:        z.number().positive('Amount must be positive').max(MAX_ESCROW_AMOUNT, `Amount cannot exceed ${MAX_ESCROW_AMOUNT}`),
  currency:      z.string().default('NGN'),
  creatorName:   z.string().min(1, 'Your name is required'),
  creatorEmail:  z.string().email('A valid email is required'),
  creatorRole:   creatorRoleSchema,
  expiresInDays: z.number().int().min(1).max(90).default(7),
  payeeAccount:  payeeAccountSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.creatorRole === EscrowRole.Payee && !data.payeeAccount) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      path:    ['payeeAccount'],
      message: 'Your bank account details are required when you are the Payee.',
    })
  }
})

export type CreateQuickEscrowInput = z.infer<typeof createQuickEscrowSchema>

// ── Quick link creation — 2-step OTP flow ────────────────────────────────────

// Step 1: submit escrow details → OTP sent to creator email
// (reuses createQuickEscrowSchema body shape)

// Step 2: confirm OTP → escrow created + fund token issued if creator is Payer
export const confirmQuickEscrowSchema = z.object({
  intentId: z.string().min(1, 'Intent ID is required'),
  otp:      z.string().length(6, 'OTP must be 6 digits').trim(),
})
export type ConfirmQuickEscrowInput = z.infer<typeof confirmQuickEscrowSchema>

// ── Quick link fund (no auth) ─────────────────────────────────────────────────

export const fundWithTokenSchema = z.object({
  fundToken: z.string().min(1, 'Fund token is required'),
})
export type FundWithTokenInput = z.infer<typeof fundWithTokenSchema>

// ── Quick link recipient join — OTP flow ──────────────────────────────────────

export const joinRequestSchema = z.object({
  name:  z.string().min(1, 'Your name is required'),
  email: z.string().email('A valid email is required').toLowerCase().trim(),
})

export type JoinRequestInput = z.infer<typeof joinRequestSchema>

export const joinVerifySchema = z.object({
  email:        z.string().email().toLowerCase().trim(),
  otp:          z.string().length(6, 'OTP must be 6 digits').trim(),
  payeeAccount: payeeAccountSchema.optional(),
})

export type JoinVerifyInput = z.infer<typeof joinVerifySchema>

// ── Disputes ──────────────────────────────────────────────────────────────────

export const openDisputeSchema = z.object({
  reason: z.string().min(10, 'Please provide a detailed reason (min 10 characters)'),
})
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>

export const resolveDisputeSchema = z.object({
  resolution: z.string().min(10, 'Please provide a detailed resolution (min 10 characters)'),
  // The resolving party must commit to an outcome — no ambiguous resolutions
  decision:   z.enum(['release', 'refund'], {
    errorMap: () => ({ message: "Decision must be 'release' (release funds to payee) or 'refund' (return funds to payer)" }),
  }),
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

// ── Pagination ────────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type PaginationInput = z.infer<typeof paginationSchema>
