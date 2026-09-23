import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { captures, zones } from '../../drizzle/schema'
import type { RoadClass } from '../types/plan'
import type { TrafficCollection } from '../lib/here-traffic-client'

/** Capture data access. Rules live in the service (BR-007). */

export type CaptureRecord = typeof captures.$inferSelect
export type CaptureStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped_limit' | 'missed'
export type CaptureTrigger = 'manual' | 'scheduled'

export interface CreateCaptureRow {
  userId: string
  zoneId: string
  scheduleId?: string | null
  trigger: CaptureTrigger
  roadClass: RoadClass
  status?: CaptureStatus
  error?: string | null
  capturedAt?: Date
  /** The instant this cycle was due. Null for manual captures. */
  scheduledFor?: Date | null
}

export async function create(input: CreateCaptureRow): Promise<CaptureRecord> {
  const rows = await db
    .insert(captures)
    .values({
      userId: input.userId,
      zoneId: input.zoneId,
      scheduleId: input.scheduleId ?? null,
      trigger: input.trigger,
      roadClass: input.roadClass,
      status: input.status ?? 'pending',
      error: input.error ?? null,
      scheduledFor: input.scheduledFor ?? null,
      ...(input.capturedAt ? { capturedAt: input.capturedAt } : {}),
    })
    .returning()
  return rows[0]!
}

export interface CompleteCaptureRow {
  traffic: TrafficCollection
  roadsCount: number
  jamFactorAvg: number | null
}

/** Marks a capture done and stores what it collected. */
export async function complete(id: string, result: CompleteCaptureRow): Promise<CaptureRecord | undefined> {
  const rows = await db
    .update(captures)
    .set({
      status: 'done',
      traffic: result.traffic,
      roadsCount: result.roadsCount,
      // numeric() round-trips as a string in pg; the service converts on the way out.
      jamFactorAvg: result.jamFactorAvg === null ? null : result.jamFactorAvg.toFixed(2),
      error: null,
    })
    .where(eq(captures.id, id))
    .returning()
  return rows[0]
}

export async function markStatus(id: string, status: CaptureStatus, error?: string): Promise<void> {
  await db
    .update(captures)
    .set({ status, error: error ?? null })
    .where(eq(captures.id, id))
}

export async function findById(id: string): Promise<CaptureRecord | undefined> {
  const rows = await db.select().from(captures).where(eq(captures.id, id)).limit(1)
  return rows[0]
}

/**
 * A zone's history, newest first.
 *
 * `traffic` is deliberately excluded: it is a whole FeatureCollection per row, and a
 * list of thirty cycles would be megabytes of geometry nobody is looking at yet. The
 * zone page fetches the list, then the one cycle the arrows land on.
 */
export async function listByZone(
  zoneId: string,
  opts: { limit: number; offset: number },
): Promise<{ rows: Omit<CaptureRecord, 'traffic'>[]; total: number }> {
  const rows = await db
    .select({
      id: captures.id,
      userId: captures.userId,
      zoneId: captures.zoneId,
      scheduleId: captures.scheduleId,
      status: captures.status,
      trigger: captures.trigger,
      roadClass: captures.roadClass,
      roadsCount: captures.roadsCount,
      jamFactorAvg: captures.jamFactorAvg,
      filePath: captures.filePath,
      fileSize: captures.fileSize,
      styleUsed: captures.styleUsed,
      error: captures.error,
      scheduledFor: captures.scheduledFor,
      capturedAt: captures.capturedAt,
      createdAt: captures.createdAt,
    })
    .from(captures)
    .where(eq(captures.zoneId, zoneId))
    .orderBy(desc(captures.capturedAt))
    .limit(opts.limit)
    .offset(opts.offset)

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(captures)
    .where(eq(captures.zoneId, zoneId))

  return { rows, total: countRows[0]?.count ?? 0 }
}

/**
 * BR-006 — captures a user has made so far on a given WIB calendar day.
 *
 * The day boundary is Jakarta's, not the server's: `AT TIME ZONE 'Asia/Jakarta'` turns
 * the stored instant into local wall-clock time before the date is taken. Counting in
 * UTC would roll a user's quota over at 07:00 WIB, seven hours into their working day.
 *
 * `skipped_limit` rows are excluded — they are the record of a capture that did NOT
 * happen, and counting them would make one refusal cause the next.
 */
export async function countForWibDay(userId: string, when: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(captures)
    .where(
      and(
        eq(captures.userId, userId),
        sql`(${captures.capturedAt} AT TIME ZONE 'Asia/Jakarta')::date = (${when.toISOString()}::timestamptz AT TIME ZONE 'Asia/Jakarta')::date`,
        // Neither a refusal nor a firing the system was down for consumed quota.
        sql`${captures.status} NOT IN ('skipped_limit', 'missed')`,
      ),
    )
  return rows[0]?.count ?? 0
}

/** The most recent capture for a zone, whatever its outcome. */
export async function latestForZone(zoneId: string): Promise<CaptureRecord | undefined> {
  const rows = await db
    .select()
    .from(captures)
    .where(eq(captures.zoneId, zoneId))
    .orderBy(desc(captures.capturedAt))
    .limit(1)
  return rows[0]
}

/** Captures per user, for the dashboard's "today" tile. */
export async function countsToday(): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: captures.userId, count: sql<number>`count(*)::int` })
    .from(captures)
    .where(
      and(
        sql`(${captures.capturedAt} AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date`,
        sql`${captures.status} NOT IN ('skipped_limit', 'missed')`,
      ),
    )
    .groupBy(captures.userId)
  return new Map(rows.map((r) => [r.userId, r.count]))
}

/** Every capture taken today, platform-wide (internal overview). */
export async function countAllToday(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(captures)
    .where(
      and(
        sql`(${captures.capturedAt} AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date`,
        sql`${captures.status} NOT IN ('skipped_limit', 'missed')`,
      ),
    )
  return rows[0]?.count ?? 0
}

/**
 * A user's most recent cycles across every zone they own.
 *
 * Backs the dashboard strip, which used to be an empty array with a comment saying
 * captures did not exist yet. `traffic` is excluded for the same reason as the per-zone
 * list: the strip shows times and outcomes, not geometry.
 */
export async function recentForUser(
  userId: string,
  limit: number,
): Promise<(Omit<CaptureRecord, 'traffic'> & { zoneName: string })[]> {
  const rows = await db
    .select({
      id: captures.id,
      userId: captures.userId,
      zoneId: captures.zoneId,
      scheduleId: captures.scheduleId,
      status: captures.status,
      trigger: captures.trigger,
      roadClass: captures.roadClass,
      roadsCount: captures.roadsCount,
      jamFactorAvg: captures.jamFactorAvg,
      filePath: captures.filePath,
      fileSize: captures.fileSize,
      styleUsed: captures.styleUsed,
      error: captures.error,
      scheduledFor: captures.scheduledFor,
      capturedAt: captures.capturedAt,
      createdAt: captures.createdAt,
      zoneName: zones.name,
    })
    .from(captures)
    .innerJoin(zones, eq(zones.id, captures.zoneId))
    .where(eq(captures.userId, userId))
    .orderBy(desc(captures.capturedAt))
    .limit(limit)
  return rows
}
