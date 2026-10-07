/**
 * Zones, against the real backend
 * (GET/POST /zones, GET/PATCH/DELETE /zones/:id, GET /traffic/preview).
 *
 * The rules that used to be enforced here — name uniqueness, road-class limits, zone
 * counts — now live in the API's service layer where they belong (BR-007), and are
 * surfaced as `ApiError` with the same codes the screens already branch on. Nothing
 * is seeded: the list shows the zones that exist.
 *
 * Two helpers stay client-side, and neither writes anything:
 *   - `areaKm2` gives the wizard a live readout while the boundary is still being
 *     drawn, before anything has been saved. The server recomputes it in PostGIS and
 *     its answer is the one stored.
 */

import { apiClient } from '@/lib/api-client'
import type { CreateZoneInput, RoadClass, Zone, ZoneStatus } from './types'

/**
 * No `plan` argument: the server reads the caller's plan from their session, which is
 * the only copy that can be trusted. Passing it from the client would have been
 * decorative at best and spoofable at worst.
 */
export async function getZones(): Promise<Zone[]> {
  return apiClient.get<Zone[]>('/zones')
}

export async function getZone(id: string): Promise<Zone> {
  return apiClient.get<Zone>(`/zones/${id}`)
}

export async function createZone(input: CreateZoneInput): Promise<Zone> {
  return apiClient.post<Zone>('/zones', input)
}

export async function updateZone(
  id: string,
  patch: Partial<Pick<Zone, 'name' | 'roadClass' | 'status'>>,
): Promise<Zone> {
  return apiClient.patch<Zone>(`/zones/${id}`, patch)
}

export async function setZoneStatus(id: string, status: ZoneStatus): Promise<Zone> {
  return apiClient.patch<Zone>(`/zones/${id}`, { status })
}

export async function deleteZone(id: string): Promise<void> {
  await apiClient.delete<{ deleted: boolean }>(`/zones/${id}`)
}

/**
 * Rough boundary area in km², for the wizard readout while drawing.
 *
 * Deliberately not the stored value: the server computes area with PostGIS on the
 * spheroid, which is more accurate than this flat approximation. This exists only so
 * the number updates as the user draws, before there is anything to ask the server
 * about.
 */
export function areaKm2(geometry: Zone['geometry']): number {
  const ring = geometry.coordinates[0]
  const lngs = ring.map(([lng]) => lng)
  const lats = ring.map(([, lat]) => lat)
  const width = (Math.max(...lngs) - Math.min(...lngs)) * 111 * Math.cos((lats[0] * Math.PI) / 180)
  const height = (Math.max(...lats) - Math.min(...lats)) * 111
  return Number(Math.max(width * height, 0.1).toFixed(1))
}

export interface RoadClassCount {
  roads: number
  lengthKm: number
}

export interface RoadClassCounts {
  counts: Record<RoadClass, RoadClassCount>
  /** Highest class the signed-in plan allows; the rest render locked. */
  maxRoadClass: RoadClass
}

/**
 * How many roads each class would actually collect inside a bbox (BR-022).
 *
 * This replaced `matchRoads`, which ignored the geometry entirely and returned a
 * hardcoded catalogue — so the figure meant to show what an upgrade buys you was
 * identical for every zone in the country.
 *
 * Counts above the caller's plan come back too, on purpose: the upgrade prompt needs
 * a real number to show, and a count is not the data itself.
 */
export async function getRoadClassCounts(bbox: [number, number, number, number]): Promise<RoadClassCounts> {
  return apiClient.get<RoadClassCounts>(`/traffic/road-class-counts?bbox=${bbox.join(',')}`)
}

/** Tight bbox around a polygon — what the counts endpoint is asked about. */
export function bboxOf(geometry: Zone['geometry']): [number, number, number, number] {
  const ring = geometry.coordinates[0] ?? []
  const lngs = ring.map((p) => p[0]!)
  const lats = ring.map((p) => p[1]!)
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

export interface TrafficFeature {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: number[][] }
  properties: {
    trafficState: 'normal' | 'slow' | 'heavy' | 'congested'
    color: string
    jamFactor?: number
    name?: string
    functionalClass?: number
  }
}

export interface TrafficPreview {
  type: 'FeatureCollection'
  features: TrafficFeature[]
}

/**
 * Live traffic for a bounding box, proxied by the API so the HERE key never reaches
 * the browser (ADR-010). The server also caps the road class to the caller's plan
 * (BR-022), so the cap cannot be edited away in devtools.
 */
export async function getTrafficPreview(
  bbox: [number, number, number, number],
  roadClass?: RoadClass,
  /**
   * The drawn ring. Given, the answer is trimmed to it — HERE only accepts a bounding
   * box, and a box is always larger than the polygon inside it, so without this the
   * preview shows roads the zone will never collect.
   */
  ring?: [number, number][],
): Promise<TrafficPreview> {
  const params = new URLSearchParams({ bbox: bbox.join(',') })
  if (roadClass) params.set('roadClass', roadClass)
  if (ring && ring.length >= 3) params.set('ring', ring.map(([lng, lat]) => `${lng},${lat}`).join(';'))
  return apiClient.get<TrafficPreview>(`/traffic/preview?${params.toString()}`)
}

/**
 * One tier of roads for the wizard's preview (ZONE-PERF): only the roads `tier` adds
 * over the class below it, as lines + colours. The server answers from the same cached
 * HERE flows the road-class counts fetched, so this costs no extra HERE calls.
 */
export async function getTrafficTier(
  bbox: [number, number, number, number],
  tier: RoadClass,
  ring: [number, number][],
): Promise<SlimTraffic> {
  const params = new URLSearchParams({ bbox: bbox.join(','), tier, format: 'slim' })
  params.set('ring', ring.map(([lng, lat]) => `${lng},${lat}`).join(';'))
  return apiClient.get<SlimTraffic>(`/traffic/preview?${params.toString()}`)
}

// --- captures: one row per cycle a zone collects (F-07) -------------------------

export type CaptureStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped_limit' | 'missed'
export type CaptureTrigger = 'manual' | 'scheduled'

export interface Capture {
  id: string
  zoneId: string
  scheduleId: string | null
  status: CaptureStatus
  trigger: CaptureTrigger
  roadClass: RoadClass
  roadsCount: number | null
  /** Mean jam factor 0–10 across collected roads. */
  jamFactorAvg: number | null
  /** R2 path. Null means no image rendered yet — never "no data". */
  filePath: string | null
  fileSize: number | null
  error: string | null
  /** When it was due. Null for manual captures, which are due when asked. */
  scheduledFor: string | null
  /** Seconds between due and collected. Null when there was nothing to be late for. */
  lateBySeconds: number | null
  capturedAt: string
}

/** One cycle with the traffic it collected — what the arrows load. */
export interface CaptureDetail extends Capture {
  traffic: TrafficPreview | null
}

export interface RecentCapture extends Capture {
  zoneName: string
  /** Signed link to the capture's small JPEG; null when it has no image. May 404 for older captures. */
  thumbnailUrl: string | null
}

/** This account's latest cycles across every zone — the dashboard strip. */
export async function getRecentCaptures(limit = 12): Promise<RecentCapture[]> {
  return apiClient.get<RecentCapture[]>(`/captures?limit=${limit}`)
}

export async function getZoneCaptures(zoneId: string, limit = 50): Promise<Capture[]> {
  return apiClient.get<Capture[]>(`/zones/${zoneId}/captures?limit=${limit}`)
}

export async function getCapture(captureId: string): Promise<CaptureDetail> {
  return apiClient.get<CaptureDetail>(`/captures/${captureId}`)
}

/** Lines and colours only — what a map draws, nothing it doesn't. */
export interface SlimTraffic {
  type: 'FeatureCollection'
  features: { c: [number, number][]; k: string }[]
}

/**
 * A capture's traffic, stripped for display rather than inspection.
 *
 * The stepper on this page used to call `getCapture` (the full ~2 MB shape, with street
 * names, per-segment jam factors and functional classes) for every arrow press, with no
 * prefetch — each step blocked on a fresh multi-megabyte fetch. Studio hit the same wall
 * first and solved it with `?slim=1`, which is ~575 KB; both callers now share it, so a
 * future change to what "slim" means only has to happen once.
 */
export async function getCaptureTrafficSlim(captureId: string): Promise<SlimTraffic | null> {
  const detail = await apiClient.get<{ traffic: SlimTraffic | null }>(`/captures/${captureId}?slim=1`)
  return detail.traffic
}

export interface CaptureImage {
  url: string
  fileName: string
  expiresInSeconds: number
}

/** A signed, short-lived download link for a capture's PNG (CAP-02). Fetch it on click. */
export async function getCaptureImage(captureId: string): Promise<CaptureImage> {
  return apiClient.get<CaptureImage>(`/captures/${captureId}/image`)
}

export interface EnqueuedCapture {
  capture: Capture
  /** False when the daily plan limit refused it (BR-008). */
  queued: boolean
}

/** Runs one cycle now (F-04). */
export async function runCapture(zoneId: string): Promise<EnqueuedCapture> {
  return apiClient.post<EnqueuedCapture>(`/zones/${zoneId}/captures`)
}

/**
 * Downloads a zone's captures as CSV (FE-30) — one row per capture, reaching back as far
 * as the plan's history. Saved by the browser under the API's file name.
 */
export type CsvRange = '1' | '7' | '30' | '90' | 'all'

export async function downloadCapturesCsv(zoneId: string, days: CsvRange): Promise<void> {
  const { blob, filename } = await apiClient.download(`/zones/${zoneId}/captures.csv?days=${days}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? 'maceut-captures.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
