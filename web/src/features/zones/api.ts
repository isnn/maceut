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

export interface EnqueuedCapture {
  capture: Capture
  /** False when the daily plan limit refused it (BR-008). */
  queued: boolean
}

/** Runs one cycle now (F-04). */
export async function runCapture(zoneId: string): Promise<EnqueuedCapture> {
  return apiClient.post<EnqueuedCapture>(`/zones/${zoneId}/captures`)
}
