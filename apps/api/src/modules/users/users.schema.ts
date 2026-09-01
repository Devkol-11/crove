import { z } from 'zod'

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
