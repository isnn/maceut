import { eq, and, ne, sql, desc } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { schedules } from '../../drizzle/schema'
import type { CaptureInterval, ScheduleStatus } from '../types/schedule'

/** Capture-window data access, scoped by user. No rules — those are in the service. */

export type ScheduleRecord = typeof schedules.$inferSelect

export interface CreateScheduleRow {
  userId: string
  zoneId: string
  label: string
  startTime: string
  endTime: string
  interval: CaptureInterval
  days: number[]
}

export async function create(input: CreateScheduleRow): Promise<ScheduleRecord> {
  const rows = await db.insert(schedules).values(input).returning()
  const row = rows[0]
  if (!row) throw new Error('insert into schedules returned no row')
  return row
}

export async function findById(id: string): Promise<ScheduleRecord | undefined> {
  const rows = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1)
  return rows[0]
}

/**
 * Every window the user owns except deleted ones.
 *
 * `deleted` is a soft delete (F-06) — capture history points at the schedule that
 * produced each frame, so removing the row would orphan that history.
 */
export async function findByUserId(userId: string): Promise<ScheduleRecord[]> {
  return db
    .select()
    .from(schedules)
    .where(and(eq(schedules.userId, userId), ne(schedules.status, 'deleted')))
    .orderBy(desc(schedules.createdAt))
}

export async function findByZoneId(zoneId: string): Promise<ScheduleRecord[]> {
  return db
    .select()
    .from(schedules)
    .where(and(eq(schedules.zoneId, zoneId), ne(schedules.status, 'deleted')))
    .orderBy(desc(schedules.createdAt))
}

/** Every active window across all accounts — what the cron scheduler loads. */
export async function findAllActive(): Promise<ScheduleRecord[]> {
  return db.select().from(schedules).where(eq(schedules.status, 'active'))
}

/**
 * BR-005 counts ACTIVE windows only.
 *
 * A paused window frees its slot, which F-06 states explicitly: pausing the tenth
 * schedule must let an eleventh be created.
 */
export async function countActive(userId: string, excludeId?: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schedules)
    .where(
      and(
        eq(schedules.userId, userId),
        eq(schedules.status, 'active'),
        excludeId ? ne(schedules.id, excludeId) : undefined,
      ),
    )
  return rows[0]?.count ?? 0
}

/**
 * Active and paused windows per account, for the internal directory.
 *
 * Grouped for the same reason as zones' version: one query for the whole page instead
 * of one per listed account. Soft-deleted rows are excluded, matching countActive.
 */
export async function countsByUser(): Promise<Map<string, { active: number; paused: number }>> {
  const rows = await db
    .select({
      userId: schedules.userId,
      active: sql<number>`count(*) filter (where ${schedules.status} = 'active')::int`,
      paused: sql<number>`count(*) filter (where ${schedules.status} = 'paused')::int`,
    })
    .from(schedules)
    .groupBy(schedules.userId)

  return new Map(rows.map((r) => [r.userId, { active: r.active, paused: r.paused }]))
}

/** Every active window on the platform (internal overview). */
export async function countAllActive(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schedules)
    .where(eq(schedules.status, 'active'))
  return rows[0]?.count ?? 0
}

export interface UpdateScheduleRow {
  label?: string
  startTime?: string
  endTime?: string
  interval?: CaptureInterval
  days?: number[]
  status?: ScheduleStatus
}

/**
 * Edits a window, and always clears its next firing.
 *
 * Retiming, changing the interval, or resuming after a pause all make a stored
 * `next_fire_at` wrong — a window resumed after a week would otherwise be due in the
 * past and fire the moment it came back. NULL means "recompute me", and the scheduler
 * reseeds it on its next pass without firing.
 */
export async function update(id: string, patch: UpdateScheduleRow): Promise<ScheduleRecord | undefined> {
  const rows = await db
    .update(schedules)
    .set({ ...patch, nextFireAt: null, updatedAt: new Date() })
    .where(eq(schedules.id, id))
    .returning()
  return rows[0]
}

/** Soft delete — see findByUserId. */
export async function softDelete(id: string): Promise<void> {
  await db
    .update(schedules)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(schedules.id, id))
}

export interface DueWindow extends ScheduleRecord {
  /** The instant this firing was due — `next_fire_at` as it was before the claim. */
  dueAt: Date
}

/**
 * Atomically claims every window that is due, and returns when each was due.
 *
 * Two Postgres details make this the lock, and both matter:
 *
 * `FOR UPDATE SKIP LOCKED` on the inner select — two API instances running this at the
 * same instant take disjoint sets instead of blocking on each other, so adding a replica
 * doubles throughput rather than doubling captures. This is what removes the "one API
 * instance only" constraint the in-memory scheduler had.
 *
 * The join against that snapshot — `RETURNING` on an UPDATE yields the NEW row, so
 * reading `next_fire_at` back from it would return what we just wrote, not what the
 * window was due at. The subquery holds the pre-update value.
 *
 * Claimed rows are left with `next_fire_at = NULL`, meaning "needs recomputing", and the
 * caller sets it — the caller knows the firing rule and SQL must not learn a second copy
 * of it. If the process dies in between, the row simply looks unseeded and is re-seeded
 * on the next boot: a missed firing rather than a duplicate one, which is the right way
 * to fail.
 */
export async function claimDue(now: Date): Promise<DueWindow[]> {
  const result = await db.execute(sql`
    UPDATE ${schedules} AS s
       SET next_fire_at = NULL
      FROM (
        SELECT id, next_fire_at AS due_at
          FROM ${schedules}
         WHERE status = 'active'
           AND next_fire_at IS NOT NULL
           AND next_fire_at <= ${now.toISOString()}::timestamptz
         FOR UPDATE SKIP LOCKED
      ) AS due
     WHERE s.id = due.id
    RETURNING s.*, due.due_at
  `)

  // Raw SQL bypasses Drizzle's column mapping, so these arrive snake_case. Spreading
  // the row straight through left `startTime` undefined and the scheduler threw on the
  // first window it claimed — mapped explicitly so the shape is checked here rather
  // than discovered at runtime.
  interface DueRow {
    id: string
    user_id: string
    zone_id: string
    label: string
    start_time: string
    end_time: string
    interval: string
    days: number[]
    status: string
    next_fire_at: string | null
    created_at: string
    updated_at: string
    due_at: string
  }

  return (result.rows as unknown as DueRow[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    zoneId: r.zone_id,
    label: r.label,
    startTime: r.start_time,
    endTime: r.end_time,
    interval: r.interval as CaptureInterval,
    days: r.days,
    status: r.status as ScheduleStatus,
    nextFireAt: r.next_fire_at ? new Date(r.next_fire_at) : null,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    dueAt: new Date(r.due_at),
  }))
}

/** Active windows whose next firing has never been computed (fresh, or just migrated). */
export async function findUnseeded(): Promise<ScheduleRecord[]> {
  return db
    .select()
    .from(schedules)
    .where(and(eq(schedules.status, 'active'), sql`${schedules.nextFireAt} IS NULL`))
}

export async function setNextFireAt(id: string, next: Date | null): Promise<void> {
  await db.update(schedules).set({ nextFireAt: next }).where(eq(schedules.id, id))
}

/** The soonest a window is due, so the scheduler can sleep until then rather than poll. */
export async function earliestDue(): Promise<Date | null> {
  const rows = await db
    .select({ next: sql<Date | null>`min(${schedules.nextFireAt})` })
    .from(schedules)
    .where(eq(schedules.status, 'active'))
  const value = rows[0]?.next
  return value ? new Date(value) : null
}

/** The soonest one of this user's windows is due — what the dashboard shows. */
export async function earliestDueForUser(userId: string): Promise<Date | null> {
  const rows = await db
    .select({ next: sql<string | null>`min(${schedules.nextFireAt})` })
    .from(schedules)
    .where(and(eq(schedules.userId, userId), eq(schedules.status, 'active')))
  const value = rows[0]?.next
  return value ? new Date(value) : null
}
