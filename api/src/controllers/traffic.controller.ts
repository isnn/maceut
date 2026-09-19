import type { Request, Response, NextFunction } from 'express'
import * as here from '../lib/here-traffic-client'
import { trafficPreviewQuerySchema } from '../schemas/zone.schema'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'
import { effectiveRoadClass, type Plan, type RoadClass } from '../types/plan'

/**
 * Proxies HERE Traffic Flow for the browser (ADR-010).
 *
 * This endpoint exists so the HERE key never reaches the client. The browser asks us,
 * we ask HERE. It also means the road-class cap is applied server-side, where it
 * cannot be edited away in devtools.
 */
export async function preview(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const plan: Plan = req.plan ?? 'free'

    const { bbox, roadClass } = trafficPreviewQuerySchema.parse(req.query)

    // BR-022 — what the caller may actually see is MIN(requested, plan maximum).
    // Requesting `semua` on a Free plan quietly narrows rather than erroring: this is
    // a preview, and refusing it would block the upgrade screen that sells the
    // difference.
    const requested: RoadClass = roadClass ?? 'semua'
    const effective = effectiveRoadClass(requested, plan)

    const flow = await here.getTrafficFlow(bbox, {
      functionalClasses: here.functionalClassesFor(effective),
    })

    return res.status(200).json(ok(flow))
  } catch (err) {
    next(err)
  }
}
