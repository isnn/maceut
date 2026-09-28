import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { exports } from '../../drizzle/schema'

/** Export data access. Rules live in the service (BR-007). */

export type ExportRecord = typeof exports.$inferSelect
export type ExportFormat = 'zip' | 'webm'
export type ExportStatus = 'queued' | 'rendering' | 'uploading' | 'done' | 'failed' | 'expired'

/** The states in which an export still has work in front of it. */
export const ACTIVE_STATUSES: ExportStatus[] = ['queued', 'rendering', 'uploading']

export interface CreateExportRow {
  userId: string
  zoneId: string
  format: ExportFormat
  spec: unknown
  frameIds: string[]
}

export async function create(input: CreateExportRow): Promise<ExportRecord> {
  const rows = await db
    .insert(exports)
    .values({
      userId: input.userId,
      zoneId: input.zoneId,
      format: input.format,
      spec: input.spec,
      frameIds: input.frameIds,
      frameCount: input.frameIds.length,
    })
    .returning()
  return rows[0]!
}

export async function findById(id: string): Promise<ExportRecord | undefined> {
  const rows = await db.select().from(exports).where(eq(exports.id, id)).limit(1)
  return rows[0]
}

/** A zone's exports, newest first. */
export async function listByZone(zoneId: string, limit: number): Promise<ExportRecord[]> {
  return db.select().from(exports).where(eq(exports.zoneId, zoneId)).orderBy(desc(exports.createdAt)).limit(limit)
}

/** The user's export that is still queued or running, if any — one at a time. */
export async function findActiveForUser(userId: string): Promise<ExportRecord | undefined> {
  const rows = await db
    .select()
    .from(exports)
    .where(and(eq(exports.userId, userId), inArray(exports.status, ACTIVE_STATUSES)))
    .limit(1)
  return rows[0]
}

/**
 * How many exports are ahead of this one in the queue. The worker renders one export at
 * a time across every account, so "ahead" means any active export created earlier.
 */
export async function countAhead(createdAt: Date): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(exports)
    .where(and(inArray(exports.status, ACTIVE_STATUSES), lt(exports.createdAt, createdAt)))
  return rows[0]?.n ?? 0
}

/** Claims a queued export for rendering. Returns undefined if it was no longer queued. */
export async function markRendering(id: string): Promise<ExportRecord | undefined> {
  const rows = await db
    .update(exports)
    .set({ status: 'rendering', startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(exports.id, id), eq(exports.status, 'queued')))
    .returning()
  return rows[0]
}

/**
 * Progress write — also the heartbeat. Only lands while the export is still rendering,
 * so a cancelled export's late progress can't resurrect it.
 */
export async function reportProgress(id: string, framesDone: number): Promise<boolean> {
  const rows = await db
    .update(exports)
    .set({ framesDone, updatedAt: new Date() })
    .where(and(eq(exports.id, id), eq(exports.status, 'rendering')))
    .returning({ id: exports.id })
  return rows.length > 0
}

/** Heartbeat while a long step runs without progress writes (a big frame, an upload). */
export async function touch(id: string): Promise<void> {
  await db
    .update(exports)
    .set({ updatedAt: new Date() })
    .where(and(eq(exports.id, id), inArray(exports.status, ['rendering', 'uploading'])))
}

export async function markUploading(id: string): Promise<void> {
  await db.update(exports).set({ status: 'uploading', updatedAt: new Date() }).where(eq(exports.id, id))
}

export async function complete(id: string, filePath: string, fileSize: number, expiresAt: Date): Promise<void> {
  const now = new Date()
  await db
    .update(exports)
    .set({ status: 'done', filePath, fileSize, finishedAt: now, updatedAt: now, expiresAt, error: null })
    .where(eq(exports.id, id))
}

/** Fails an export that is still active. A finished or already-failed row is left alone. */
export async function fail(id: string, error: string): Promise<boolean> {
  const now = new Date()
  const rows = await db
    .update(exports)
    .set({ status: 'failed', error, finishedAt: now, updatedAt: now })
    .where(and(eq(exports.id, id), inArray(exports.status, ACTIVE_STATUSES)))
    .returning({ id: exports.id })
  return rows.length > 0
}

export async function remove(id: string): Promise<void> {
  await db.delete(exports).where(eq(exports.id, id))
}

/** Renders whose heartbeat stopped before `before` — the worker died mid-job. */
export async function findStale(before: Date): Promise<ExportRecord[]> {
  return db
    .select()
    .from(exports)
    .where(and(inArray(exports.status, ['rendering', 'uploading']), lt(exports.updatedAt, before)))
}

/** Finished exports past their retention, oldest first. */
export async function findExpired(now: Date, limit = 50): Promise<ExportRecord[]> {
  return db
    .select()
    .from(exports)
    .where(and(eq(exports.status, 'done'), lt(exports.expiresAt, now)))
    .orderBy(asc(exports.expiresAt))
    .limit(limit)
}

export async function markExpired(id: string): Promise<void> {
  await db.update(exports).set({ status: 'expired', filePath: null, updatedAt: new Date() }).where(eq(exports.id, id))
}
