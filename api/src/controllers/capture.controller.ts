import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as captureService from '../services/capture.service'
import { UnauthorizedError } from '../errors'
import { ok, paginated } from '../types/api'

const idParam = z.string().uuid('Id tidak valid.')

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // Capped so a zone with a year of history cannot be asked for in one response.
  limit: z.coerce.number().int().positive().max(100).default(20),
})

/**
 * Manual capture (F-04).
 *
 * 202 rather than 201: the row exists but the cycle has not finished — the worker still
 * has to ask HERE. Answering 201 would claim a completed capture that is seconds away
 * at best. A capture refused by the daily limit also answers 202 with `queued: false`,
 * because BR-008 makes that a recorded outcome rather than an error.
 */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const zoneId = idParam.parse(req.params.id)
    return res.status(202).json(ok(await captureService.enqueueCapture(req.userId, zoneId, { trigger: 'manual' })))
  } catch (err) {
    next(err)
  }
}

/** This account's latest cycles across every zone — the dashboard strip. */
export async function recent(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const limit = z.coerce.number().int().positive().max(50).default(12).parse(req.query.limit)
    return res.status(200).json(ok(await captureService.recentForUser(req.userId, limit)))
  } catch (err) {
    next(err)
  }
}

/** A zone's cycle history, newest first (F-07). */
export async function listForZone(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const zoneId = idParam.parse(req.params.id)
    const q = listQuerySchema.parse(req.query)

    const result = await captureService.listForZone(req.userId, zoneId, q)
    return res.status(200).json(
      paginated(result.captures, {
        total: result.total,
        page: result.page,
        limit: result.limit,
        total_pages: result.totalPages,
      }),
    )
  } catch (err) {
    next(err)
  }
}

/** One cycle including its traffic — what the zone page loads when an arrow moves. */
export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const id = idParam.parse(req.params.id)
    return res.status(200).json(ok(await captureService.getCapture(req.userId, id)))
  } catch (err) {
    next(err)
  }
}
