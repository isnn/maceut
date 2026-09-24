import { eq, and, sql } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { zones } from '../../drizzle/schema'
import type { RoadClass } from '../types/plan'

/**
 * Zone data access.
 *
 * Every query that touches `geometry` goes through a `sql` template, because PostGIS
 * has no Drizzle representation (ADR-011). Everything else uses the query builder —
 * raw SQL for a plain `WHERE user_id = ?` would be the wrong trade.
 *
 * Geometry crosses this boundary as GeoJSON: `ST_GeomFromGeoJSON` on the way in,
 * `ST_AsGeoJSON(...)::json` on the way out, so no caller ever handles WKB or WKT.
 */

export type ZoneStatus = 'collecting' | 'paused'

export interface ZoneGeometry {
  type: 'Polygon'
  coordinates: number[][][]
}

/** A zone as the rest of the app sees it. `areaKm2` is computed, never stored. */
export interface ZoneRecord {
  id: string
  userId: string
  name: string
  geometry: ZoneGeometry
  roadClass: RoadClass
  status: ZoneStatus
  areaKm2: number
  roadsCount: number | null
  lengthKm: number | null
  createdAt: Date
  updatedAt: Date
}

/** Raw shape of a selected row before the numeric columns are coerced. */
interface RawZoneRow {
  id: string
  user_id: string
  name: string
  geometry: ZoneGeometry
  road_class: RoadClass
  status: ZoneStatus
  area_km2: string | number | null
  roads_count: number | null
  length_km: string | number | null
  created_at: Date | string
  updated_at: Date | string
}

/**
 * The column list every read shares.
 *
 * `ST_Area(geography(geometry))` returns square metres on the spheroid — casting to
 * `geography` first is what makes it metres rather than square degrees, which are
 * meaningless as an area at Indonesian latitudes.
 */
const ZONE_COLUMNS = sql`
  id,
  user_id,
  name,
  ST_AsGeoJSON(geometry)::json AS geometry,
  road_class,
  status,
  ST_Area(geography(geometry)) / 1000000.0 AS area_km2,
  roads_count,
  length_km,
  created_at,
  updated_at
`

/** pg returns numeric/double as strings to avoid precision loss; the API wants numbers. */
function num(value: string | number | null): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toRecord(row: RawZoneRow): ZoneRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    geometry: row.geometry,
    roadClass: row.road_class,
    status: row.status,
    // Area is always computable from the boundary, so it is never null in practice;
    // round to 2dp because sub-10m² precision is noise on a city zone.
    areaKm2: Math.round((num(row.area_km2) ?? 0) * 100) / 100,
    roadsCount: row.roads_count,
    lengthKm: num(row.length_km),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export interface CreateZoneRow {
  userId: string
  name: string
  geometry: ZoneGeometry
  roadClass: RoadClass
  roadsCount?: number | null
  lengthKm?: number | null
}

export async function create(input: CreateZoneRow): Promise<ZoneRecord> {
  const result = await db.execute(sql`
    INSERT INTO zones (user_id, name, geometry, road_class, roads_count, length_km)
    VALUES (
      ${input.userId},
      ${input.name},
      ST_GeomFromGeoJSON(${JSON.stringify(input.geometry)}),
      ${input.roadClass}::road_class,
      ${input.roadsCount ?? null},
      ${input.lengthKm ?? null}
    )
    RETURNING ${ZONE_COLUMNS}
  `)
  return toRecord(result.rows[0] as unknown as RawZoneRow)
}

export async function findById(id: string): Promise<ZoneRecord | undefined> {
  const result = await db.execute(sql`SELECT ${ZONE_COLUMNS} FROM zones WHERE id = ${id}`)
  const row = result.rows[0]
  return row ? toRecord(row as unknown as RawZoneRow) : undefined
}

export async function findByUserId(userId: string): Promise<ZoneRecord[]> {
  const result = await db.execute(sql`
    SELECT ${ZONE_COLUMNS} FROM zones WHERE user_id = ${userId} ORDER BY created_at DESC
  `)
  return result.rows.map((r) => toRecord(r as unknown as RawZoneRow))
}

export interface UpdateZoneRow {
  name?: string
  roadClass?: RoadClass
  status?: ZoneStatus
  roadsCount?: number | null
  lengthKm?: number | null
}

/**
 * Partial update. The boundary is deliberately not updatable — redrawing it is
 * effectively a different zone, and its captures would no longer describe what they
 * claim to (BR-028).
 */
export async function update(id: string, patch: UpdateZoneRow): Promise<ZoneRecord | undefined> {
  const sets = []
  if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
  if (patch.roadClass !== undefined) sets.push(sql`road_class = ${patch.roadClass}::road_class`)
  if (patch.status !== undefined) sets.push(sql`status = ${patch.status}::zone_status`)
  if (patch.roadsCount !== undefined) sets.push(sql`roads_count = ${patch.roadsCount}`)
  if (patch.lengthKm !== undefined) sets.push(sql`length_km = ${patch.lengthKm}`)

  // Nothing to change — return the row as-is rather than emitting `SET` with no
  // assignments, which is a syntax error.
  if (sets.length === 0) return findById(id)

  sets.push(sql`updated_at = NOW()`)

  const result = await db.execute(sql`
    UPDATE zones SET ${sql.join(sets, sql`, `)} WHERE id = ${id} RETURNING ${ZONE_COLUMNS}
  `)
  const row = result.rows[0]
  return row ? toRecord(row as unknown as RawZoneRow) : undefined
}

export async function deleteById(id: string): Promise<void> {
  await db.delete(zones).where(eq(zones.id, id))
}

/**
 * Counts zones that are actually collecting, not every row.
 *
 * Matches how BR-005 counts schedules, and it is what makes pausing a real remedy:
 * counting every row would mean an account paused down to its limit still could not
 * create anything, so the grandfather rule would leave them permanently stuck.
 */
export async function countByUserId(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(zones)
    .where(and(eq(zones.userId, userId), eq(zones.status, 'collecting')))
  return rows[0]?.count ?? 0
}

/**
 * Collecting and paused zones per account, for the internal directory.
 *
 * One GROUP BY rather than two queries per row: the directory lists every account, so
 * a per-row count would be a query per account and the page would get slower with
 * every signup. Accounts with no zones are simply absent from the map — the caller
 * reads a missing key as zero, which it is.
 */
export async function countsByUser(): Promise<Map<string, { collecting: number; paused: number }>> {
  const rows = await db
    .select({
      userId: zones.userId,
      collecting: sql<number>`count(*) filter (where ${zones.status} = 'collecting')::int`,
      paused: sql<number>`count(*) filter (where ${zones.status} = 'paused')::int`,
    })
    .from(zones)
    .groupBy(zones.userId)

  return new Map(rows.map((r) => [r.userId, { collecting: r.collecting, paused: r.paused }]))
}

/** Every collecting zone on the platform (internal overview). */
export async function countAllCollecting(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(zones)
    .where(eq(zones.status, 'collecting'))
  return rows[0]?.count ?? 0
}

/**
 * BR-015 — name uniqueness per user, case-insensitive.
 *
 * `excludeZoneId` is what makes rename work: without it, saving a zone under its own
 * current name collides with itself and is rejected.
 */
export async function existsByNameAndUserId(
  userId: string,
  name: string,
  excludeZoneId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: zones.id })
    .from(zones)
    .where(
      and(
        eq(zones.userId, userId),
        sql`lower(${zones.name}) = lower(${name})`,
        excludeZoneId ? sql`${zones.id} <> ${excludeZoneId}` : undefined,
      ),
    )
    .limit(1)
  return rows.length > 0
}

/** Bounding box of a zone as [west, south, east, north] — what HERE's flow API takes. */
export async function bboxOf(id: string): Promise<[number, number, number, number] | undefined> {
  const result = await db.execute(sql`
    SELECT ST_XMin(geometry) AS w, ST_YMin(geometry) AS s, ST_XMax(geometry) AS e, ST_YMax(geometry) AS n
    FROM zones WHERE id = ${id}
  `)
  const row = result.rows[0] as unknown as { w: number; s: number; e: number; n: number } | undefined
  if (!row) return undefined
  return [Number(row.w), Number(row.s), Number(row.e), Number(row.n)]
}
