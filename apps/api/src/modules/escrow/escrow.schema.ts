import { z } from 'zod'
import { EscrowType, EscrowStatus } from './escrow.types'

const milestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().positive(),
  deadline: z.string().datetime().optional(),
})

export const createEscrowSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(EscrowType.Standard),
    title: z.string().min(1),
    description: z.string().optional(),
    amount: z.number().positive(),
    currency: z.string().default('NGN'),
    recipientEmail: z.string().email().optional(),
  }),
  z.object({
    type: z.literal(EscrowType.Milestone),
    title: z.string().min(1),
    description: z.string().optional(),
    currency: z.string().default('NGN'),
    milestones: z.array(milestoneSchema).min(1),
    recipientEmail: z.string().email().optional(),
  }),
  z.object({
    type: z.literal(EscrowType.Conditional),
    title: z.string().min(1),
    description: z.string().optional(),
    amount: z.number().positive(),
    currency: z.string().default('NGN'),
    releaseCondition: z.string().min(1, 'A release condition is required'),
    recipientEmail: z.string().email().optional(),
  }),
  z.object({
    type: z.literal(EscrowType.Deposit),
    title: z.string().min(1),
    description: z.string().optional(),
    amount: z.number().positive(),
    currency: z.string().default('NGN'),
    recipientEmail: z.string().email().optional(),
  }),
])

export type CreateEscrowInput = z.infer<typeof createEscrowSchema>

export const transitionSchema = z.object({
  status: z.nativeEnum(EscrowStatus),
})
export type TransitionInput = z.infer<typeof transitionSchema>

export const openDisputeSchema = z.object({
  reason: z.string().min(10, 'Please provide a detailed reason (min 10 characters)'),
})
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>

export const resolveDisputeSchema = z.object({
  resolution: z.string().min(10, 'Please provide a detailed resolution (min 10 characters)'),
})
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>
