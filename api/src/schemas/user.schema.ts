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

/**
 * Staff creating an account for someone (F-21).
 *
 * `password` is optional on purpose. Left out, the server generates a strong one and
 * returns it exactly once, which is the better default: an admin inventing passwords
 * for other people reliably produces weak, reused ones. It is accepted when given
 * because there is no email delivery yet, so an admin sitting with someone during
 * setup needs to be able to choose something they can both say out loud.
 *
 * The 8-character floor matches Better Auth's `minPasswordLength` — validating here
 * too means the caller gets a field error in their own language rather than Better
 * Auth's generic one.
 */
export const createUserSchema = z.object({
  email: z.string({ required_error: 'Email wajib diisi.' }).trim().toLowerCase().email('Format email tidak valid.'),
  fullName: z
    .string({ required_error: 'Nama wajib diisi.' })
    .trim()
    .min(1, 'Nama wajib diisi.')
    .max(120, 'Nama terlalu panjang.'),
  plan: planEnum.default('free'),
  role: roleEnum.default('user'),
  password: z.string().min(8, 'Password minimal 8 karakter.').max(128, 'Password terlalu panjang.').optional(),
})

export const changePlanSchema = z.object({ plan: planEnum })
export const changeRoleSchema = z.object({ role: roleEnum })
