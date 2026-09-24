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
    /** HERE functional class 1–5. Absent in practice — HERE does not return it (see fcOf). */
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
 * Functional class, if a response happens to carry one.
 *
 * ANSWERED 2026-09-20, and the answer changed the design: HERE's v7 flow response
 * does **not** include a functional class per segment. It is a request filter only
 * (`functionalClasses=1,2,3`), per
 * docs.here.com/traffic-api/docs/flow-filter-functional-class-flow-1.
 *
 * That means BR-022's tiering can only be enforced upstream. This reader is kept
 * because it costs nothing and would pick the field up if HERE ever adds it, but
 * nothing may depend on it being present.
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
  /**
   * Restrict to these HERE functional classes. Sent to HERE as `functionalClasses`,
   * which is the ONLY way to filter: the response carries no class to filter on.
   * Empty or omitted returns every class.
   */
  functionalClasses?: number[]
  /**
   * The zone's outer ring, [lng, lat]. Given, the answer is trimmed to segments that
   * touch it — HERE only accepts a bounding box, which is always larger than the
   * polygon drawn inside it.
   */
  clipTo?: [number, number][]
  signal?: AbortSignal
}

export function buildFlowUrl(bbox: BBox, opts: TrafficFlowOptions = {}): string {
  const [west, south, east, north] = bbox
  const url = new URL(config.hereTrafficFlowUrl)
  url.searchParams.set('in', `bbox:${west},${south},${east},${north}`)
  // `shape` returns the geometry we turn into GeoJSON LineStrings. HERE also accepts
  // `olr` and `tmc`, neither of which carries drawable coordinates.
  url.searchParams.set('locationReferencing', 'shape')

  // Always sent when a filter is wanted — there is no local fallback, because the
  // response has no class to filter on.
  if (opts.functionalClasses?.length) {
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
 * Road-class filtering is done by HERE, not by us. An earlier version filtered
 * locally on a `functionalClass` field in the response — which does not exist. That
 * made the filter a silent no-op: every plan would have received every road class,
 * and BR-022's tiering (the main paid differentiator) would have sold nothing.
 *
 * Filtering upstream also costs less: HERE returns fewer segments.
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

  const collection = toGeoJson(payload, opts.functionalClasses)
  return opts.clipTo ? clipToPolygon(collection, opts.clipTo) : collection
}

/**
 * Turns a status code into something an operator can act on.
 *
 * HERE's own `error_description` is included because it distinguishes cases a status
 * code alone cannot: "not from an authorized source" (the app is disabled, the key is
 * restricted to referrers/IPs, or it has not propagated yet) reads very differently
 * from an unknown key, yet both arrive as a bare 401.
 */
function describeStatus(status: number, body: string): string {
  const snippet = body.slice(0, 300).replace(/\s+/g, ' ')

  let description = ''
  try {
    const parsed = JSON.parse(body) as { error_description?: string; error?: string }
    description = parsed.error_description ?? parsed.error ?? ''
  } catch {
    description = snippet
  }

  if (status === 401) {
    return (
      `HTTP 401 — ${description || 'unauthorized'}. Check, in order: ` +
      'the app is Active in platform.here.com; the API key has no domain/IP restriction ' +
      '(a server sends no Referer, so a browser-restricted key always fails here); ' +
      'the Traffic product is enabled on that app; and a newly created key may need a few minutes.'
    )
  }
  if (status === 403) return `HTTP 403 — ${description || snippet} (quota, plan, or product not enabled)`
  if (status === 429) return 'HTTP 429 — HERE rate limit or quota exhausted'
  if (status === 400) return `HTTP 400 — HERE rejected the request: ${description || snippet}`
  return `HTTP ${status}: ${description || snippet}`
}

/**
 * Great-circle length of a collection's LineStrings, in metres.
 *
 * Lives here rather than beside either caller because both measure the same thing —
 * HERE flow geometry — and two copies of a haversine would drift silently: a wrong
 * earth radius produces plausible kilometres, not an error.
 *
 * HERE does report `location.length`, but not on every result, and mixing a reported
 * length with a derived one would make the total mean two different things depending
 * on what came back.
 */
export function totalLengthMetres(collection: TrafficCollection): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  let total = 0

  for (const feature of collection.features) {
    const coordinates = feature.geometry.coordinates
    for (let i = 1; i < coordinates.length; i++) {
      const [lng1, lat1] = coordinates[i - 1]!
      const [lng2, lat2] = coordinates[i]!
      const dLat = rad(lat2 - lat1)
      const dLng = rad(lng2 - lng1)
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
      total += 2 * R * Math.asin(Math.sqrt(a))
    }
  }
  return total
}

/** Metres to kilometres, two decimals — the form every screen shows. */
export function toKm(metres: number): number {
  return Math.round((metres / 1000) * 100) / 100
}

/**
 * Is this point inside the ring? Ray casting, counting edge crossings to the east.
 *
 * Used to keep HERE's answer inside the zone the user actually drew. HERE is asked for
 * a BOUNDING BOX, because that is the only shape its API takes — and a bounding box is
 * always bigger than the polygon inside it. Without this, every zone that is not a
 * perfect rectangle showed traffic on roads outside its own boundary, and the stored
 * captures recorded them too.
 */
function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    // Strictly one edge endpoint above and one below, so a vertex is counted once.
    const straddles = yi > lat !== yj > lat
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Keeps only the segments that touch the polygon.
 *
 * A segment counts as inside if ANY of its points is — clipping the geometry exactly
 * would cut roads mid-span and leave dangling ends that imply a road stops at the
 * zone's edge, which is worse than a short overhang. HERE's shape points are dense
 * enough at city scale that a road crossing a zone always has a point inside it.
 */
export function clipToPolygon(collection: TrafficCollection, ring: [number, number][]): TrafficCollection {
  if (ring.length < 3) return collection
  return {
    type: 'FeatureCollection',
    features: collection.features.filter((f) =>
      f.geometry.coordinates.some(([lng, lat]) => pointInRing(lng, lat, ring)),
    ),
  }
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
      // Defensive only. HERE filters upstream and does not return a class, so this
      // drops nothing today — but if the field ever appears, a segment outside the
      // requested set must not be drawn.
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
