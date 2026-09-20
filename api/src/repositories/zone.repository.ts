import { eq, and, sql } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { zones } from '../../drizzle/schema'
import type { RoadClass } from '../types/plan'

/**
 * Zone data access — scoped by workspace, never by user.
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
  workspaceId: string
  createdBy: string | null
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
  workspace_id: string
  created_by: string | null
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
  workspace_id,
  created_by,
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
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
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
  workspaceId: string
  createdBy: string
  name: string
  geometry: ZoneGeometry
  roadClass: RoadClass
  roadsCount?: number | null
  lengthKm?: number | null
}

export async function create(input: CreateZoneRow): Promise<ZoneRecord> {
  const result = await db.execute(sql`
    INSERT INTO zones (workspace_id, created_by, name, geometry, road_class, roads_count, length_km)
    VALUES (
      ${input.workspaceId},
      ${input.createdBy},
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

export async function findByWorkspaceId(workspaceId: string): Promise<ZoneRecord[]> {
  const result = await db.execute(sql`
    SELECT ${ZONE_COLUMNS} FROM zones WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC
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

export async function countByWorkspaceId(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(zones)
    .where(eq(zones.workspaceId, workspaceId))
  return rows[0]?.count ?? 0
}

/**
 * BR-015 — name uniqueness per workspace, case-insensitive.
 *
 * Per workspace rather than per user: two colleagues both creating "Zona Malioboro"
 * in the same account is the collision worth preventing.
 *
 * `excludeZoneId` is what makes rename work: without it, saving a zone under its own
 * current name collides with itself and is rejected.
 */
export async function existsByNameInWorkspace(
  workspaceId: string,
  name: string,
  excludeZoneId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: zones.id })
    .from(zones)
    .where(
      and(
        eq(zones.workspaceId, workspaceId),
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
