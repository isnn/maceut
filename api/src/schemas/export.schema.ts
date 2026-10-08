import { z } from 'zod'

/**
 * Studio's render settings, as the page held them when Export was pressed. Validated
 * for shape and bounds only: themes travel by id, and the renderer — the one place the
 * palettes are defined — resolves them (and falls back to a default for an unknown id).
 */
export const exportSpecSchema = z.object({
  themeId: z.string().trim().min(1).max(40),
  congestionId: z.string().trim().min(1).max(40),
  overlay: z.object({
    effect: z.enum(['none', 'vignette']),
    title: z.string().max(60),
    textSize: z.enum(['none', 'small', 'medium', 'large']),
    text: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      align: z.enum(['left', 'center', 'right']),
    }),
    legend: z.boolean(),
    boundary: z.boolean(),
  }),
  view: z.object({
    zoomOffset: z.number().min(-10).max(20),
    panX: z.number().min(-2).max(2),
    panY: z.number().min(-2).max(2),
  }),
  width: z.number().int().min(200).max(4000),
  height: z.number().int().min(200).max(4000),
  /** How long each animation frame is held, in ms — the preview's playback speed. */
  holdMs: z.number().int().min(100).max(5000),
  /**
   * EXP-C — ZIP frame format. PNG is exact; WebP (quality 90) is 4–8× smaller and looks
   * the same to the eye. Videos always encode from PNG frames, whatever this says.
   */
  imageFormat: z.enum(['png', 'webp']).default('png'),
})

export type ExportSpec = z.infer<typeof exportSpecSchema>

export const createExportSchema = z.object({
  format: z.enum(['zip', 'webm', 'mp4'], { errorMap: () => ({ message: 'Format harus zip, webm atau mp4.' }) }),
  /** The range, as the first and last capture in it — the same ids Studio's picker holds. */
  startCaptureId: z.string().uuid('Id capture awal tidak valid.'),
  endCaptureId: z.string().uuid('Id capture akhir tidak valid.'),
  spec: exportSpecSchema,
})

export type CreateExportInput = z.infer<typeof createExportSchema>
