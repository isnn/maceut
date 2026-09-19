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
 *   - `matchRoads` is still a local estimate. See the note on it.
 */

import { apiClient } from '@/lib/api-client'
import type { CreateZoneInput, MatchedRoad, RoadClass, Zone, ZoneStatus } from './types'

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

const ROAD_CATALOG: MatchedRoad[] = [
  { name: 'Tol Dalam Kota', roadClass: 'nasional', lengthKm: 5.0 },
  { name: 'Jl. Jend. Gatot Subroto', roadClass: 'nasional', lengthKm: 4.2 },
  { name: 'Jl. Jend. Sudirman', roadClass: 'provinsi', lengthKm: 3.1 },
  { name: 'Jl. H.R. Rasuna Said', roadClass: 'provinsi', lengthKm: 2.5 },
  { name: 'Jl. Prof. Dr. Satrio', roadClass: 'provinsi', lengthKm: 2.1 },
  { name: 'Jl. Casablanca Raya', roadClass: 'kota', lengthKm: 1.8 },
  { name: 'Jl. Karet Pasar Baru', roadClass: 'kota', lengthKm: 1.2 },
]

/**
 * ⚠️ STILL AN ESTIMATE — the last fabricated data left in this feature.
 *
 * The road-class picker shows "how many roads would this class collect?" while the
 * user is choosing, which needs a live answer from HERE for the boundary they have
 * drawn. HERE is not configured yet, so this returns a fixed catalogue that ignores
 * the geometry entirely — the same names regardless of where the zone is.
 *
 * It is kept because removing it would leave the picker with nothing to show at the
 * moment of choosing. The *stored* counts on a zone are real: they come from the
 * server as `roadsCount`/`lengthKm`, and are null (rendered "—") until HERE is
 * configured rather than being filled in from here.
 *
 * To finish: call `getTrafficPreview` for the boundary once per class and count the
 * returned features. Blocked on HERE_API_KEY.
 */
export function matchRoads(_geometry: Zone['geometry'], roadClass: RoadClass): MatchedRoad[] {
  const allowed: Record<RoadClass, MatchedRoad['roadClass'][]> = {
    nasional: ['nasional'],
    nasional_provinsi: ['nasional', 'provinsi'],
    semua: ['nasional', 'provinsi', 'kota'],
  }
  return ROAD_CATALOG.filter((road) => allowed[roadClass].includes(road.roadClass))
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
): Promise<TrafficPreview> {
  const params = new URLSearchParams({ bbox: bbox.join(',') })
  if (roadClass) params.set('roadClass', roadClass)
  return apiClient.get<TrafficPreview>(`/traffic/preview?${params.toString()}`)
}
