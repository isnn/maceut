import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as captureService from '../services/capture.service'
import { UnauthorizedError } from '../errors'
import { ok, paginated } from '../types/api'

const idParam = z.string().uuid('Id tidak valid.')

/** FE-32 — the CSV's time range: the dialog's choices. Omitted = the plan's whole history. */
const csvQuery = z.object({ days: z.enum(['1', '7', '30', '90', 'all']).optional() })

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

/** A capture's rendered PNG, as a signed download link (CAP-02). */
export async function image(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const id = idParam.parse(req.params.id)
    return res.status(200).json(ok(await captureService.getCaptureImage(req.userId, id)))
  } catch (err) {
    next(err)
  }
}

/** One cycle including its traffic — what the zone page loads when an arrow moves. */
export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const id = idParam.parse(req.params.id)
    // `?slim=1` returns lines and colours only — what the Studio player draws. A full
    // capture is ~2 MB, and a twenty-frame playback of those is 40 MB of geometry
    // nobody is inspecting road by road.
    if (req.query.slim === '1') {
      return res.status(200).json(ok(await captureService.getPlaybackFrame(req.userId, id)))
    }
    return res.status(200).json(ok(await captureService.getCapture(req.userId, id)))
  } catch (err) {
    next(err)
  }
}

/** A zone's captures as CSV, as far back as the plan's history reaches (FE-30). */
export async function exportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const zoneId = idParam.parse(req.params.id)
    const { days } = csvQuery.parse(req.query)
    const { csv, zoneName, range } = await captureService.exportCsv(
      req.userId,
      req.plan ?? 'free',
      zoneId,
      days === undefined ? undefined : days === 'all' ? null : Number(days),
    )
    const slug = zoneName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'zone'
    const today = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="maceut-${slug}-captures-${today}.csv"`)
    res.setHeader('X-Export-Range', range)
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Range')
    return res.status(200).send(csv)
  } catch (err) {
    next(err)
  }
}
