import { config, isHereConfigured } from '../config/env'
import { UpstreamError, ValidationError } from '../errors'
import { ROAD_CLASS_FC, type RoadClass } from '../types/plan'

/**
 * HERE Traffic Flow v7 — data only, never tiles (ADR-010). The basemap is OSM.
 *
 * Output is the exact GeoJSON the map already renders, so swapping the frontend's
 * mock for this endpoint changes no component:
 *
 *   { type: 'FeatureCollection', features: [{ geometry: LineString,
 *     properties: { trafficState, color } }] }
 *
 * Colours are BR-017's and match `web/src/lib/constants.ts` literally. If one side
 * changes, both must.
 */

export type TrafficState = 'normal' | 'slow' | 'heavy' | 'congested'

export const TRAFFIC_STATE_COLOR: Record<TrafficState, string> = {
  normal: '#4CAF50',
  slow: '#F4A300',
  heavy: '#EF7B21',
  congested: '#EF4444',
}

export interface TrafficFeature {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  properties: {
    trafficState: TrafficState
    color: string
    /** 0–10 from HERE, kept so the UI can show detail without re-deriving state. */
    jamFactor: number
    /** Street name where HERE provides one. */
    name?: string
    /** HERE functional class 1–5, when the response carries it. See FC_AVAILABLE below. */
    functionalClass?: number
  }
}

export interface TrafficCollection {
  type: 'FeatureCollection'
  features: TrafficFeature[]
}

/** [west, south, east, north] in WGS84 (BR-013). */
export type BBox = [number, number, number, number]

/**
 * Largest bbox we will ask HERE for.
 *
 * HERE bills per request and a continent-sized box returns a response big enough to
 * stall the API, so an oversized zone is rejected with a 422 rather than forwarded.
 * Roughly 0.5° square — comfortably larger than any city-scale zone.
 */
export const MAX_BBOX_DEGREES = 0.5

/**
 * BR-017 thresholds on HERE's 0–10 jam factor.
 *
 * ⚠️ BR-017 names the four states and their colours but does not define the cut
 * points; these are a judgement call and want product sign-off. HERE documents 10 as
 * road closed, so the top band is deliberately narrow.
 */
export function stateFromJamFactor(jamFactor: number): TrafficState {
  if (jamFactor >= 8) return 'congested'
  if (jamFactor >= 6) return 'heavy'
  if (jamFactor >= 4) return 'slow'
  return 'normal'
}

/** HERE functional classes a road class may collect (BR-001..003, BR-022). */
export function functionalClassesFor(roadClass: RoadClass): number[] {
  return ROAD_CLASS_FC[roadClass].map((fc) => Number(fc.replace('FC', '')))
}

// --- HERE's response, as much of it as we read ---------------------------------

interface HereLink {
  points?: { lat: number; lng: number }[]
  functionalClass?: number
  length?: number
}

interface HereResult {
  location?: {
    description?: string
    length?: number
    shape?: { links?: HereLink[] }
    functionalClass?: number
  }
  currentFlow?: {
    jamFactor?: number
    speed?: number
    freeFlow?: number
    traversability?: string
  }
}

interface HereFlowResponse {
  results?: HereResult[]
}

/**
 * Where the functional class sits in a v7 response, if anywhere.
 *
 * This is the open question flagged in the plan: BR-022's road-class tiering — the
 * main paid differentiator between Free, Standard and Premium — assumes HERE reports
 * a functional class per segment. Both plausible locations are read here, and
 * `npm run env:check` reports which (if either) a live response actually carries.
 * If neither does, the tiering needs a different mechanism and that is a product
 * decision, not a bug to patch here.
 */
function fcOf(result: HereResult, link: HereLink): number | undefined {
  return link.functionalClass ?? result.location?.functionalClass
}

export function validateBBox(bbox: BBox): void {
  const [west, south, east, north] = bbox

  if (![west, south, east, north].every((n) => Number.isFinite(n))) {
    throw new ValidationError('bbox harus berisi 4 angka: west,south,east,north.')
  }
  if (west >= east || south >= north) {
    throw new ValidationError('bbox tidak valid — west harus < east dan south harus < north.')
  }
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    throw new ValidationError('bbox di luar rentang WGS84 yang sah.')
  }
  if (east - west > MAX_BBOX_DEGREES || north - south > MAX_BBOX_DEGREES) {
    throw new ValidationError(
      `Area terlalu luas — maksimum ${MAX_BBOX_DEGREES}° per sisi. Perkecil zona lalu coba lagi.`,
      { maxDegrees: MAX_BBOX_DEGREES },
    )
  }
}

export interface TrafficFlowOptions {
  /** Restrict to these HERE functional classes. Empty or omitted returns everything. */
  functionalClasses?: number[]
  /** Ask HERE to filter server-side too. Off by default — see getTrafficFlow. */
  filterUpstream?: boolean
  signal?: AbortSignal
}

export function buildFlowUrl(bbox: BBox, opts: TrafficFlowOptions = {}): string {
  const [west, south, east, north] = bbox
  const url = new URL(config.hereTrafficFlowUrl)
  url.searchParams.set('in', `bbox:${west},${south},${east},${north}`)
  url.searchParams.set('locationReferencing', 'shape')
  if (opts.filterUpstream && opts.functionalClasses?.length) {
    url.searchParams.set('functionalClasses', opts.functionalClasses.join(','))
  }
  url.searchParams.set('apiKey', config.hereApiKey as string)
  return url.toString()
}

/** Same URL with the key replaced — safe to log or put in an error. */
export function redactUrl(url: string): string {
  return url.replace(/(apiKey=)[^&]+/, '$1***')
}

/**
 * Fetches traffic flow for a bounding box and maps it to GeoJSON.
 *
 * Filtering by functional class happens **locally** by default rather than through
 * HERE's `functionalClasses` parameter. Two reasons: a parameter HERE does not accept
 * fails the whole request with a 400 instead of degrading, and filtering locally lets
 * the response be inspected for whether it carries a functional class at all. Pass
 * `filterUpstream: true` once env:check has confirmed the parameter works — it is
 * cheaper, since HERE returns less.
 */
export async function getTrafficFlow(bbox: BBox, opts: TrafficFlowOptions = {}): Promise<TrafficCollection> {
  // Validate the caller's input first. Answering "HERE is not configured" to a
  // malformed bbox reports our deployment problem instead of their request problem,
  // and the request would still be wrong once HERE was configured.
  validateBBox(bbox)

  if (!isHereConfigured()) {
    throw new UpstreamError(
      'HERE',
      'not configured — set HERE_API_KEY in api/.env, then restart. Run `npm run env:check` to verify.',
    )
  }

  const url = buildFlowUrl(bbox, opts)

  let res: Response
  try {
    res = await fetch(url, { signal: opts.signal })
  } catch (err) {
    throw new UpstreamError('HERE', `request failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new UpstreamError('HERE', describeStatus(res.status, body))
  }

  let payload: HereFlowResponse
  try {
    payload = (await res.json()) as HereFlowResponse
  } catch {
    throw new UpstreamError('HERE', 'response was not valid JSON')
  }

  return toGeoJson(payload, opts.functionalClasses)
}

/** Turns a status code into something an operator can act on. */
function describeStatus(status: number, body: string): string {
  const snippet = body.slice(0, 200)
  if (status === 401) return 'HTTP 401 — HERE_API_KEY is wrong, or Traffic is not enabled for that key'
  if (status === 403) return `HTTP 403 — key rejected for this request (quota or plan): ${snippet}`
  if (status === 429) return 'HTTP 429 — HERE rate limit or quota exhausted'
  if (status === 400) return `HTTP 400 — HERE rejected the request: ${snippet}`
  return `HTTP ${status}: ${snippet}`
}

export function toGeoJson(payload: HereFlowResponse, functionalClasses?: number[]): TrafficCollection {
  const features: TrafficFeature[] = []
  const wanted = functionalClasses && functionalClasses.length > 0 ? new Set(functionalClasses) : null

  for (const result of payload.results ?? []) {
    const jamFactor = result.currentFlow?.jamFactor
    if (typeof jamFactor !== 'number') continue

    const state = stateFromJamFactor(jamFactor)

    for (const link of result.location?.shape?.links ?? []) {
      // A LineString needs at least two positions; a one-point link is not drawable.
      const points = link.points ?? []
      if (points.length < 2) continue

      const fc = fcOf(result, link)
      // Only drop a segment when its class is known and unwanted. Dropping unknowns
      // would silently empty the map if HERE stops reporting the field.
      if (wanted && fc !== undefined && !wanted.has(fc)) continue

      features.push({
        type: 'Feature',
        // GeoJSON is [longitude, latitude] — HERE gives lat/lng named, and swapping
        // these puts Indonesian roads in Somalia.
        geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat] as [number, number]) },
        properties: {
          trafficState: state,
          color: TRAFFIC_STATE_COLOR[state],
          jamFactor,
          ...(result.location?.description ? { name: result.location.description } : {}),
          ...(fc !== undefined ? { functionalClass: fc } : {}),
        },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}
