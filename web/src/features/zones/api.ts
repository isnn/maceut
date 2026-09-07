// TODO: replace with real fetch through @/lib/api-client once api/ exists
// (GET/POST/PATCH /zones, DELETE /zones/:id, GET /traffic/preview).
// Seeds a demo workspace on first read so the turn 3 screens have data to show.

import { ApiError } from '@/types/api'
import { PLAN_LIMITS } from '@/lib/constants'
import { generateId } from '@/lib/utils'
import type { Plan } from '@/features/auth/types'
import type { CreateZoneInput, MatchedRoad, RoadClass, Zone, ZoneStatus } from './types'

const ZONES_KEY = 'maceut_mock_zones'
const SEEDED_KEY = 'maceut_mock_zones_seeded'
const MOCK_LATENCY_MS = 400
const ROAD_CLASS_ORDER: RoadClass[] = ['nasional', 'nasional_provinsi', 'semua']

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

function boxGeometry(lng: number, lat: number, size = 0.012): Zone['geometry'] {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng, lat],
        [lng + size, lat],
        [lng + size, lat - size],
        [lng, lat - size],
        [lng, lat],
      ],
    ],
  }
}

/** The three zones the mockups show, in the order 3f lists them. */
function demoZones(): Zone[] {
  return [
    {
      id: generateId(),
      name: 'Koridor Sudirman',
      geometry: boxGeometry(106.818, -6.208),
      roadClass: 'nasional_provinsi',
      status: 'collecting',
      areaKm2: 8.9,
      roadsCount: 3,
      lengthKm: 11.6,
      cadence: 'Per jam',
      createdAt: '2026-07-22T02:00:00.000Z',
    },
    {
      id: generateId(),
      name: 'Satrio – Casablanca',
      geometry: boxGeometry(106.83, -6.224),
      roadClass: 'nasional_provinsi',
      status: 'collecting',
      areaKm2: 5.2,
      roadsCount: 2,
      lengthKm: 5.9,
      cadence: 'Per jam',
      createdAt: '2026-08-04T02:00:00.000Z',
    },
    {
      id: generateId(),
      name: 'Tol Cawang–Grogol',
      geometry: boxGeometry(106.86, -6.24, 0.02),
      roadClass: 'nasional',
      status: 'paused',
      areaKm2: 12.4,
      roadsCount: 1,
      lengthKm: 5.0,
      cadence: 'Harian',
      createdAt: '2026-08-12T02:00:00.000Z',
    },
  ]
}

function readZones(): Zone[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(ZONES_KEY)
  if (!raw) return []
  const parsed = JSON.parse(raw) as Partial<Zone>[]
  // Zones created before the turn 3 fields existed still need to render.
  return parsed.map((z) => ({
    id: z.id!,
    name: z.name!,
    geometry: z.geometry!,
    roadClass: z.roadClass ?? 'nasional',
    status: z.status ?? 'collecting',
    areaKm2: z.areaKm2 ?? 0,
    roadsCount: z.roadsCount ?? 0,
    lengthKm: z.lengthKm ?? 0,
    cadence: z.cadence ?? 'Belum dijadwalkan',
    createdAt: z.createdAt ?? new Date().toISOString(),
  }))
}

function writeZones(zones: Zone[]) {
  window.localStorage.setItem(ZONES_KEY, JSON.stringify(zones))
}

/**
 * Seeds demo zones once per browser, sized to the plan so quota readouts stay
 * coherent (a Free workspace gets the one zone its plan allows).
 */
function seedIfEmpty(plan: Plan) {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(SEEDED_KEY)) return
  window.localStorage.setItem(SEEDED_KEY, '1')
  if (readZones().length > 0) return
  const seed = plan === 'free' ? demoZones().slice(0, 1) : demoZones()
  writeZones(seed)
}

export async function getZones(plan: Plan = 'standard'): Promise<Zone[]> {
  seedIfEmpty(plan)
  return delay(readZones().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)))
}

export async function getZone(id: string): Promise<Zone> {
  const zone = readZones().find((z) => z.id === id)
  if (!zone) {
    await delay(null)
    throw new ApiError({ code: 'NOT_FOUND', message: 'Zona tidak ditemukan.' })
  }
  return delay(zone)
}

export async function createZone(input: CreateZoneInput, plan: Plan): Promise<Zone> {
  const zones = readZones()

  if (zones.some((z) => z.name.toLowerCase() === input.name.toLowerCase())) {
    await delay(null)
    throw new ApiError({ code: 'ZONE_NAME_TAKEN', message: 'Nama zona sudah digunakan.' })
  }

  if (zones.length >= PLAN_LIMITS[plan].zonesLimit) {
    await delay(null)
    throw new ApiError({
      code: 'ZONE_LIMIT_EXCEEDED',
      message: `Paket Anda mencakup ${PLAN_LIMITS[plan].zonesLimit} zona dan semuanya sedang dipakai.`,
    })
  }

  const maxRoadClass = PLAN_LIMITS[plan].maxRoadClass
  if (ROAD_CLASS_ORDER.indexOf(input.roadClass) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)) {
    await delay(null)
    throw new ApiError({
      code: 'ROAD_CLASS_NOT_ALLOWED',
      message: 'Road class ini memerlukan upgrade plan.',
      details: { requiredPlan: maxRoadClass },
    })
  }

  const matched = matchRoads(input.geometry, input.roadClass)
  const zone: Zone = {
    id: generateId(),
    name: input.name,
    geometry: input.geometry,
    roadClass: input.roadClass,
    status: 'collecting',
    areaKm2: areaKm2(input.geometry),
    roadsCount: matched.length,
    lengthKm: Number(matched.reduce((sum, r) => sum + r.lengthKm, 0).toFixed(1)),
    cadence: 'Belum dijadwalkan',
    createdAt: new Date().toISOString(),
  }
  writeZones([...zones, zone])
  return delay(zone)
}

export async function updateZone(id: string, patch: Partial<Pick<Zone, 'name' | 'status' | 'roadClass'>>): Promise<Zone> {
  const zones = readZones()
  const zone = zones.find((z) => z.id === id)
  if (!zone) {
    await delay(null)
    throw new ApiError({ code: 'NOT_FOUND', message: 'Zona tidak ditemukan.' })
  }
  const updated = { ...zone, ...patch }
  writeZones(zones.map((z) => (z.id === id ? updated : z)))
  return delay(updated)
}

export async function setZoneStatus(id: string, status: ZoneStatus): Promise<Zone> {
  return updateZone(id, { status })
}

export async function deleteZone(id: string): Promise<void> {
  writeZones(readZones().filter((z) => z.id !== id))
  await delay(null)
}

/** Rough boundary area in km², good enough for the wizard readout. */
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

/** Which catalog roads a boundary + road class would collect (3c preview). */
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
  properties: { trafficState: 'normal' | 'slow' | 'heavy' | 'congested'; color: string }
}

export interface TrafficPreview {
  type: 'FeatureCollection'
  features: TrafficFeature[]
}

const TRAFFIC_STATES: TrafficFeature['properties']['trafficState'][] = ['normal', 'slow', 'heavy', 'congested']
const TRAFFIC_STATE_COLOR: Record<string, string> = {
  normal: '#4CAF50',
  slow: '#F4A300',
  heavy: '#EF7B21',
  congested: '#EF4444',
}

export async function getTrafficPreview(bbox: [number, number, number, number]): Promise<TrafficPreview> {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const segments = 8
  const features: TrafficFeature[] = Array.from({ length: segments }, (_, i) => {
    const t = i / segments
    const lat = minLat + (maxLat - minLat) * t
    const lng1 = minLng + (maxLng - minLng) * Math.random()
    const lng2 = minLng + (maxLng - minLng) * Math.random()
    const state = TRAFFIC_STATES[Math.floor(Math.random() * TRAFFIC_STATES.length)]
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[lng1, lat], [lng2, lat + 0.001]] },
      properties: { trafficState: state, color: TRAFFIC_STATE_COLOR[state] },
    }
  })
  return delay({ type: 'FeatureCollection', features })
}
