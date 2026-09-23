import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import type { CaptureInterval } from '../types/schedule'
import * as here from '../lib/here-traffic-client'
import { isHereConfigured } from '../config/env'
import { NotFoundError, ForbiddenError, ZoneNameTakenError, RoadClassNotAllowedError, ValidationError } from '../errors'
import {
  PLAN_LIMITS,
  isRoadClassAllowed,
  effectiveRoadClass,
  type Plan,
  type RoadClass,
} from '../types/plan'
import type { ZoneGeometry, ZoneRecord, ZoneStatus } from '../repositories/zone.repository'

/**
 * Zone business rules. Every limit and permission check lives here, never in the
 * controller (BR-007).
 */

export interface PublicZone {
  id: string
  name: string
  geometry: ZoneGeometry
  roadClass: RoadClass
  status: ZoneStatus
  areaKm2: number
  /** Null when HERE is unconfigured — "not known", which the UI renders as "—". */
  roadsCount: number | null
  lengthKm: number | null
  /**
   * What this zone is scheduled to do, in words. Null when no active window points at
   * it — absence rather than a sentence, so the UI decides how to phrase "not
   * scheduled" in its own language.
   */
  cadence: string | null
  createdAt: string
}

const INTERVAL_WORD: Record<CaptureInterval, string> = {
  '15min': 'Every 15 min',
  hourly: 'Hourly',
  daily: 'Daily',
}

/**
 * A one-line description of a zone's schedule, from its actual windows.
 *
 * This used to be the constant string "Belum dijadwalkan" — Indonesian copy in an
 * English interface, and, worse, permanently wrong: a zone collecting hourly for days
 * still reported that nothing was scheduled. Display copy was never the API's to
 * invent; what it owes the caller is the facts.
 */
function describeCadence(cadence?: scheduleRepo.ZoneCadence): string | null {
  if (!cadence || cadence.activeWindows === 0) return null
  const word = INTERVAL_WORD[cadence.finestInterval]
  return cadence.activeWindows === 1
    ? `${word} · ${cadence.earliestStart}–${cadence.latestEnd}`
    : `${word} · ${cadence.activeWindows} windows`
}

export function toPublic(zone: ZoneRecord, cadence?: scheduleRepo.ZoneCadence): PublicZone {
  return {
    id: zone.id,
    name: zone.name,
    geometry: zone.geometry,
    roadClass: zone.roadClass,
    status: zone.status,
    areaKm2: zone.areaKm2,
    roadsCount: zone.roadsCount,
    lengthKm: zone.lengthKm,
    cadence: describeCadence(cadence),
    createdAt: zone.createdAt.toISOString(),
  }
}

/** Loads a zone and proves it belongs to this user. */
async function ownedZone(userId: string, zoneId: string): Promise<ZoneRecord> {
  const zone = await zoneRepo.findById(zoneId)
  if (!zone) throw new NotFoundError('Zona')
  // 403 rather than 404: the id is real, the caller just has no claim to it. Both are
  // defensible; consistency with tech.md's table matters more than the debate.
  if (zone.userId !== userId) throw new ForbiddenError('Zona ini bukan milik Anda.')
  return zone
}

/**
 * BR-013 — a polygon must be a closed ring of at least four positions (three corners
 * plus the repeated closing point), in WGS84.
 *
 * Checked here as well as by the column type so the caller gets a 422 naming the
 * problem, instead of a Postgres error surfacing as a 500.
 */
export function validateGeometry(geometry: ZoneGeometry): void {
  if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) {
    throw new ValidationError('Geometry harus GeoJSON Polygon.')
  }
  const ring = geometry.coordinates[0]
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new ValidationError('Polygon butuh minimal 3 titik dan harus tertutup.')
  }

  for (const position of ring) {
    if (!Array.isArray(position) || position.length < 2) {
      throw new ValidationError('Setiap titik polygon harus berupa [longitude, latitude].')
    }
    const [lng, lat] = position as [number, number]
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new ValidationError('Titik polygon di luar rentang WGS84 yang sah (BR-013).')
    }
  }

  const first = ring[0] as [number, number]
  const last = ring[ring.length - 1] as [number, number]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new ValidationError('Polygon harus tertutup — titik pertama dan terakhir wajib sama.')
  }
}

/** Bounding box of a GeoJSON polygon, as [west, south, east, north]. */
export function bboxOfGeometry(geometry: ZoneGeometry): [number, number, number, number] {
  const ring = geometry.coordinates[0] as [number, number][]
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  return [west, south, east, north]
}

/**
 * Counts road segments and total length inside the boundary for a road class.
 *
 * Returns nulls rather than zeros when HERE is unconfigured or unreachable: zero
 * would claim the zone matched no roads, which is a different statement from "we do
 * not know yet". A failure here must never block creating a zone — the boundary is
 * the user's work, the counts are a convenience.
 */
export async function deriveRoadStats(
  geometry: ZoneGeometry,
  roadClass: RoadClass,
): Promise<{ roadsCount: number | null; lengthKm: number | null }> {
  if (!isHereConfigured()) return { roadsCount: null, lengthKm: null }

  try {
    const bbox = bboxOfGeometry(geometry)
    const flow = await here.getTrafficFlow(bbox, {
      functionalClasses: here.functionalClassesFor(roadClass),
      // The zone's own boundary, not the box around it — otherwise `roadsCount` counts
      // roads the zone does not contain, and the figure the wizard sold is not the
      // figure the zone collects.
      clipTo: geometry.coordinates[0] as [number, number][],
    })

    return { roadsCount: flow.features.length, lengthKm: here.toKm(here.totalLengthMetres(flow)) }
  } catch {
    // HERE down, over quota, or the bbox rejected — the zone is still valid.
    return { roadsCount: null, lengthKm: null }
  }
}

export interface CreateZoneInput {
  name: string
  geometry: ZoneGeometry
  roadClass: RoadClass
}

export async function createZone(userId: string, plan: Plan, input: CreateZoneInput): Promise<PublicZone> {
  validateGeometry(input.geometry)

  // BR-021 — the requested road class must be within the plan.
  if (!isRoadClassAllowed(plan, input.roadClass)) {
    throw new RoadClassNotAllowedError(input.roadClass, PLAN_LIMITS[plan].maxRoadClass)
  }

  // BR-015 — names are unique per user.
  if (await zoneRepo.existsByNameAndUserId(userId, input.name)) {
    throw new ZoneNameTakenError(input.name)
  }

  // Zone count limit for the plan.
  const limit = PLAN_LIMITS[plan].zonesLimit
  if ((await zoneRepo.countByUserId(userId)) >= limit) {
    throw new ValidationError(`Paket Anda dibatasi ${limit} zona. Hapus zona lain atau naikkan paket.`, {
      limit,
      plan,
    })
  }

  const stats = await deriveRoadStats(input.geometry, input.roadClass)

  const created = await zoneRepo.create({
    userId,
    name: input.name.trim(),
    geometry: input.geometry,
    roadClass: input.roadClass,
    ...stats,
  })
  return toPublic(created)
}

export async function getZonesForUser(userId: string): Promise<PublicZone[]> {
  // One grouped query for the whole list rather than one per zone — the list is every
  // zone the account owns, so per-zone lookups would get slower with each new zone.
  const [zones, cadences] = await Promise.all([
    zoneRepo.findByUserId(userId),
    scheduleRepo.cadenceByZone(userId),
  ])
  return zones.map((zone) => toPublic(zone, cadences.get(zone.id)))
}

export async function getZone(userId: string, zoneId: string): Promise<PublicZone> {
  const zone = await ownedZone(userId, zoneId)
  const cadences = await scheduleRepo.cadenceByZone(userId)
  return toPublic(zone, cadences.get(zone.id))
}

export interface UpdateZoneInput {
  name?: string
  roadClass?: RoadClass
  status?: ZoneStatus
}

/**
 * Updates name, road class or status (F-24, BR-028..030).
 *
 * The boundary is not editable. Changing the road class re-derives the road stats:
 * leaving them stale would have the zone claim to collect roads it no longer does.
 */
export async function updateZone(
  userId: string,
  zoneId: string,
  plan: Plan,
  patch: UpdateZoneInput,
): Promise<PublicZone> {
  const zone = await ownedZone(userId, zoneId)

  const next: zoneRepo.UpdateZoneRow = {}

  if (patch.name !== undefined && patch.name.trim() !== zone.name) {
    const name = patch.name.trim()
    // Excluding this zone is what lets a rename to its own current name succeed.
    if (await zoneRepo.existsByNameAndUserId(userId, name, zoneId)) {
      throw new ZoneNameTakenError(name)
    }
    next.name = name
  }

  if (patch.roadClass !== undefined && patch.roadClass !== zone.roadClass) {
    // BR-021 applies to edits too — otherwise editing is a way around the limit the
    // create path enforces.
    if (!isRoadClassAllowed(plan, patch.roadClass)) {
      throw new RoadClassNotAllowedError(patch.roadClass, PLAN_LIMITS[plan].maxRoadClass)
    }
    next.roadClass = patch.roadClass

    const stats = await deriveRoadStats(zone.geometry, patch.roadClass)
    next.roadsCount = stats.roadsCount
    next.lengthKm = stats.lengthKm
  }

  if (patch.status !== undefined) next.status = patch.status

  const updated = await zoneRepo.update(zoneId, next)
  if (!updated) throw new NotFoundError('Zona')
  return toPublic(updated)
}

export async function deleteZone(userId: string, zoneId: string): Promise<void> {
  await ownedZone(userId, zoneId)
  await zoneRepo.deleteById(zoneId)
}

/**
 * BR-022 — what a capture actually collects: MIN(zone's class, plan's maximum).
 *
 * A zone keeps the class it was created with after a downgrade; only the capture is
 * capped, so an upgrade restores the original depth without the user editing anything.
 */
export function getEffectiveRoadClass(zone: PublicZone, plan: Plan): RoadClass {
  return effectiveRoadClass(zone.roadClass, plan)
}

export function getEffectiveFunctionalClasses(zone: PublicZone, plan: Plan): number[] {
  return here.functionalClassesFor(getEffectiveRoadClass(zone, plan))
}
