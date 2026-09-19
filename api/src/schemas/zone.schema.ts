import { z } from 'zod'

const roadClass = z.enum(['nasional', 'nasional_provinsi', 'semua'], {
  errorMap: () => ({ message: 'Kelas jalan tidak dikenal.' }),
})

/**
 * A GeoJSON position: [longitude, latitude], in that order.
 *
 * The order is the classic mistake — swapping it puts an Indonesian zone off the
 * coast of Somalia, and the map renders empty rather than wrong, which is much harder
 * to notice. Ranges are checked here; the service checks closure and ring length.
 */
const position = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
])

const polygon = z.object({
  type: z.literal('Polygon', { errorMap: () => ({ message: 'Geometry harus bertipe Polygon.' }) }),
  coordinates: z.array(z.array(position).min(4, 'Polygon butuh minimal 3 titik dan harus tertutup.')).min(1),
})

export const createZoneSchema = z.object({
  name: z
    .string({ required_error: 'Nama zona wajib diisi.' })
    .trim()
    .min(1, 'Nama zona wajib diisi.')
    .max(120, 'Nama zona terlalu panjang.'),
  geometry: polygon,
  roadClass,
})

export const updateZoneSchema = z
  .object({
    name: z.string().trim().min(1, 'Nama zona wajib diisi.').max(120, 'Nama zona terlalu panjang.').optional(),
    roadClass: roadClass.optional(),
    status: z.enum(['collecting', 'paused'], { errorMap: () => ({ message: 'Status tidak dikenal.' }) }).optional(),
  })
  // An empty PATCH is a caller mistake worth naming, not a silent no-op.
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan yang dikirim.' })

/** `?bbox=west,south,east,north` */
export const trafficPreviewQuerySchema = z.object({
  bbox: z
    .string({ required_error: 'Parameter bbox wajib diisi.' })
    .transform((raw, ctx) => {
      const parts = raw.split(',').map((p) => Number(p.trim()))
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox harus berupa 4 angka: west,south,east,north.' })
        return z.NEVER
      }
      return parts as [number, number, number, number]
    }),
  roadClass: roadClass.optional(),
})

export type CreateZoneBody = z.infer<typeof createZoneSchema>
export type UpdateZoneBody = z.infer<typeof updateZoneSchema>
