import type * as here from '../lib/here-traffic-client'
import { functionalClassesFor } from '../lib/here-traffic-client'
import { meteredTrafficFlow } from './here-usage.service'
import type { HereSource } from '../repositories/here-usage.repository'
import type { RoadClass } from '../types/plan'

/**
 * HERE flows for the zone wizard, kept for a few minutes (ZONE-PERF).
 *
 * The wizard asks about the same box several times in a row: the road-class step counts
 * all three classes (three metered HERE calls), then the preview draws one of them — which
 * used to be a FOURTH call for data already fetched. Both now read through this cache, so
 * the preview and switching classes cost no extra HERE requests.
 *
 * Flows are stored unclipped (the box HERE answered for); callers clip to their ring.
 * In-process and short-lived on purpose: traffic changes, and a stale preview minutes
 * old is fine where a stale one from yesterday is not.
 */

const TTL_MS = 5 * 60 * 1000
const MAX_ENTRIES = 40

const cache = new Map<string, { at: number; flow: here.TrafficCollection }>()

function keyFor(bbox: here.BBox, roadClass: RoadClass): string {
  return `${bbox.map((n) => n.toFixed(6)).join(',')}|${roadClass}`
}

/** The flow for a box and class — from the cache when fresh, from HERE (metered) otherwise. */
export async function getFlow(
  source: HereSource,
  bbox: here.BBox,
  roadClass: RoadClass,
  now: number = Date.now(),
): Promise<here.TrafficCollection> {
  const key = keyFor(bbox, roadClass)
  const hit = cache.get(key)
  if (hit && now - hit.at < TTL_MS) return hit.flow

  const flow = await meteredTrafficFlow(source, bbox, { functionalClasses: functionalClassesFor(roadClass) })
  cache.delete(key)
  cache.set(key, { at: now, flow })
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  return flow
}

/** Test seam. */
export function clearTrafficCache(): void {
  cache.clear()
}
