import { eq, and, ne, sql, desc } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { schedules } from '../../drizzle/schema'
import type { CaptureInterval, ScheduleStatus } from '../types/schedule'

/** Capture-window data access, scoped by workspace. No rules — those are in the service. */

export type ScheduleRecord = typeof schedules.$inferSelect

export interface CreateScheduleRow {
  workspaceId: string
  zoneId: string
  createdBy: string
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
 * Every window in the workspace except deleted ones.
 *
 * `deleted` is a soft delete (F-06) — capture history points at the schedule that
 * produced each frame, so removing the row would orphan that history.
 */
export async function findByWorkspaceId(workspaceId: string): Promise<ScheduleRecord[]> {
  return db
    .select()
    .from(schedules)
    .where(and(eq(schedules.workspaceId, workspaceId), ne(schedules.status, 'deleted')))
    .orderBy(desc(schedules.createdAt))
}

export async function findByZoneId(zoneId: string): Promise<ScheduleRecord[]> {
  return db
    .select()
    .from(schedules)
    .where(and(eq(schedules.zoneId, zoneId), ne(schedules.status, 'deleted')))
    .orderBy(desc(schedules.createdAt))
}

/** Every active window across all workspaces — what the cron scheduler loads. */
export async function findAllActive(): Promise<ScheduleRecord[]> {
  return db.select().from(schedules).where(eq(schedules.status, 'active'))
}

/**
 * BR-005 counts ACTIVE windows only.
 *
 * A paused window frees its slot, which F-06 states explicitly: pausing the tenth
 * schedule must let an eleventh be created.
 */
export async function countActive(workspaceId: string, excludeId?: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schedules)
    .where(
      and(
        eq(schedules.workspaceId, workspaceId),
        eq(schedules.status, 'active'),
        excludeId ? ne(schedules.id, excludeId) : undefined,
      ),
    )
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

export async function update(id: string, patch: UpdateScheduleRow): Promise<ScheduleRecord | undefined> {
  const rows = await db
    .update(schedules)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schedules.id, id))
    .returning()
  return rows[0]
}

/** Soft delete — see findByWorkspaceId. */
export async function softDelete(id: string): Promise<void> {
  await db
    .update(schedules)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(schedules.id, id))
}
