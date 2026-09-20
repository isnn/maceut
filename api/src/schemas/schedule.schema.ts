import { z } from 'zod'
import { CAPTURE_INTERVALS } from '../types/schedule'
import { MEMBER_ROLES } from '../types/workspace'

const interval = z.enum(CAPTURE_INTERVALS as unknown as [string, ...string[]], {
  errorMap: () => ({ message: 'Interval tidak dikenal.' }),
})

/** "HH:mm", 24-hour. The service checks ordering; this checks the shape. */
const time = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Jam harus dalam format HH:mm (24 jam).')

/** 0 = Monday … 6 = Sunday, matching the Schedule board's day toggles. */
const days = z.array(z.number().int().min(0).max(6)).min(1, 'Pilih minimal satu hari.').max(7)

export const createScheduleSchema = z.object({
  zoneId: z.string().uuid('Id zona tidak valid.'),
  label: z.string().trim().min(1, 'Nama jendela wajib diisi.').max(120, 'Nama jendela terlalu panjang.'),
  start: time,
  end: time,
  interval,
  days,
})

export const updateScheduleSchema = z
  .object({
    label: z.string().trim().min(1, 'Nama jendela wajib diisi.').max(120).optional(),
    start: time.optional(),
    end: time.optional(),
    interval: interval.optional(),
    days: days.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan yang dikirim.' })

// --- Team ---------------------------------------------------------------------

const role = z.enum(MEMBER_ROLES as unknown as [string, ...string[]], {
  errorMap: () => ({ message: 'Peran tidak dikenal.' }),
})

export const inviteMemberSchema = z.object({
  email: z
    .string({ required_error: 'Email wajib diisi.' })
    .trim()
    .email('Format email tidak valid.')
    .max(254)
    .transform((v) => v.toLowerCase()),
  role,
})

export const changeMemberRoleSchema = z.object({ role })

export const switchWorkspaceSchema = z.object({
  workspaceId: z.string().uuid('Id workspace tidak valid.'),
})
