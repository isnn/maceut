import { z } from 'zod'
import { PLANS } from '../types/plan'

const planEnum = z.enum(PLANS as unknown as [string, ...string[]], {
  errorMap: () => ({ message: 'Paket tidak dikenal.' }),
})

const roleEnum = z.enum(['user', 'internal'], {
  errorMap: () => ({ message: 'Role tidak dikenal.' }),
})

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  plan: planEnum.optional(),
  role: roleEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  // Capped so a caller cannot ask for every row at once and stall the database.
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['created_desc', 'created_asc', 'email_asc']).default('created_desc'),
})

export const changePlanSchema = z.object({ plan: planEnum })
export const changeRoleSchema = z.object({ role: roleEnum })
