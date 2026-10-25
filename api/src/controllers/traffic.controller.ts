import type { Request, Response, NextFunction } from 'express'
import * as here from '../lib/here-traffic-client'
import * as trafficCache from '../services/traffic-cache.service'
import { slimTraffic } from '../services/capture.service'
import { trafficPreviewQuerySchema } from '../schemas/zone.schema'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'
import { effectiveRoadClass, ROAD_CLASS_ORDER, type Plan } from '../types/plan'
import { PLAN_LIMITS } from '../types/plan'

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

    const { bbox, roadClass, ring, tier, format } = trafficPreviewQuerySchema.parse(req.query)
    const maxClass = PLAN_LIMITS[plan].maxRoadClass

    let flow: here.TrafficCollection
    if (tier) {
      // BR-022 — a tier above the plan is simply empty: nothing to see, nothing fetched.
      if (ROAD_CLASS_ORDER.indexOf(tier) > ROAD_CLASS_ORDER.indexOf(maxClass)) {
        flow = { type: 'FeatureCollection', features: [] }
      } else {
        // Classes are cumulative, so a tier is its class minus the class below it.
        const below = ROAD_CLASS_ORDER[ROAD_CLASS_ORDER.indexOf(tier) - 1]
        const [current, lower] = await Promise.all([
          trafficCache.getFlow('preview', bbox, tier),
          below ? trafficCache.getFlow('preview', bbox, below) : null,
        ])
        const seen = new Set((lower?.features ?? []).map(segmentKey))
        flow = { ...current, features: current.features.filter((f) => !seen.has(segmentKey(f))) }
      }
    } else {
      // BR-022 — what the caller may actually see is MIN(requested, plan maximum).
      // Requesting `semua` on a Free plan quietly narrows rather than erroring: this is
      // a preview, and refusing it would block the upgrade screen that sells the
      // difference.
      flow = await trafficCache.getFlow('preview', bbox, effectiveRoadClass(roadClass ?? 'semua', plan))
    }

    // Trimmed to the drawn shape when the caller sends one. The bbox is what HERE needs;
    // the ring is what the user actually drew.
    if (ring) flow = here.clipToPolygon(flow, ring)

    return res.status(200).json(ok(format === 'slim' ? slimTraffic(flow) : flow))
  } catch (err) {
    next(err)
  }
}

/** Identifies a road segment across tiers — HERE gives no id, so its geometry is the key. */
function segmentKey(f: here.TrafficCollection['features'][number]): string {
  const c = f.geometry.coordinates
  return `${c.length}|${c[0]}|${c[c.length - 1]}`
}

/**
 * How many road segments each class would actually collect over a bbox (BR-022).
 *
 * This is what the road-class step in the zone wizard reads. It replaced a local
 * catalogue that ignored the geometry entirely and returned the same invented numbers
 * wherever you drew — so the number that is supposed to sell the difference between
 * plans was the same on every zone in the country.
 *
 * ⚠️ Counts for classes ABOVE the caller's plan are returned deliberately, unlike
 * /traffic/preview which caps what it returns. Counting is not seeing: the caller
 * learns that a Premium zone here would cover 8,684 roads rather than 1,043, and gets
 * no geometry for any of them. Withholding the number would leave the upgrade prompt
 * with nothing to say, which is the one thing this endpoint exists to do.
 *
 * Costs three HERE requests, one per tier, run in parallel. There is no way to do it in
 * one: the flow response carries no functional class, so the split can only be made by
 * asking HERE three different questions.
 */
export async function roadClassCounts(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const plan: Plan = req.plan ?? 'free'
    const { bbox } = trafficPreviewQuerySchema.parse(req.query)

    const results = await Promise.all(
      ROAD_CLASS_ORDER.map(async (roadClass) => {
        // Cached: the preview that follows reads these same flows instead of asking HERE again.
        const flow = await trafficCache.getFlow('road_counts', bbox, roadClass)
        return [roadClass, flow] as const
      }),
    )

    const counts: Record<string, { roads: number; lengthKm: number }> = {}
    for (const [roadClass, flow] of results) {
      counts[roadClass] = { roads: flow.features.length, lengthKm: here.toKm(here.totalLengthMetres(flow)) }
    }

    return res.status(200).json(
      ok({
        counts,
        /** What the caller's plan allows, so the UI locks the rest without a second call. */
        maxRoadClass: PLAN_LIMITS[plan].maxRoadClass,
      }),
    )
  } catch (err) {
    next(err)
  }
}
