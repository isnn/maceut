import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as geocode from '../services/geocode.service'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'

export const searchSchema = z.object({
  q: z.string().trim().min(2, 'Ketik minimal 2 huruf.').max(120, 'Maksimal 120 karakter.'),
})

/** Place search for the zone map. */
export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const { q } = searchSchema.parse(req.query)
    return res.status(200).json(ok(await geocode.searchPlaces(q)))
  } catch (err) {
    next(err)
  }
}
