// TODO: replace with real fetch through @/lib/api-client once api/ exists
// (GET/POST /zones, DELETE /zones/:id, GET /traffic/preview).

import { ApiError } from '@/types/api'
import { PLAN_LIMITS } from '@/lib/constants'
import { generateId } from '@/lib/utils'
import type { Plan } from '@/features/auth/types'
import type { CreateZoneInput, RoadClass, Zone } from './types'

const ZONES_KEY = 'maceut_mock_zones'
const MOCK_LATENCY_MS = 400
const ROAD_CLASS_ORDER: RoadClass[] = ['nasional', 'nasional_provinsi', 'semua']

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

function readZones(): Zone[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(ZONES_KEY)
  return raw ? (JSON.parse(raw) as Zone[]) : []
}

function writeZones(zones: Zone[]) {
  window.localStorage.setItem(ZONES_KEY, JSON.stringify(zones))
}

export async function getZones(): Promise<Zone[]> {
  return delay(readZones().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)))
}

export async function createZone(input: CreateZoneInput, plan: Plan): Promise<Zone> {
  const zones = readZones()

  if (zones.some((z) => z.name.toLowerCase() === input.name.toLowerCase())) {
    await delay(null)
    throw new ApiError({ code: 'ZONE_NAME_TAKEN', message: 'Nama zona sudah digunakan.' })
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

  const zone: Zone = {
    id: generateId(),
    name: input.name,
    geometry: input.geometry,
    roadClass: input.roadClass,
    createdAt: new Date().toISOString(),
  }
  writeZones([...zones, zone])
  return delay(zone)
}

export async function deleteZone(id: string): Promise<void> {
  writeZones(readZones().filter((z) => z.id !== id))
  await delay(null)
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
