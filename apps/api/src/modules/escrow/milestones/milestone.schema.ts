import { z } from 'zod'

export const submitMilestoneSchema = z.object({
  milestoneId: z.string().cuid(),
})

export const approveMilestoneSchema = z.object({
  milestoneId: z.string().cuid(),
})

export type SubmitMilestoneInput = z.infer<typeof submitMilestoneSchema>
export type ApproveMilestoneInput = z.infer<typeof approveMilestoneSchema>
