import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { renderCache } from '../../drizzle/schema'

/** Render-cache data access (EXP-A2). Rules live in render-cache.service. */

export type RenderCacheRecord = typeof renderCache.$inferSelect

/** Cached frames for these captures under one style, keyed by capture id. */
export async function findMany(specHash: string, captureIds: string[]): Promise<Map<string, RenderCacheRecord>> {
  if (!captureIds.length) return new Map()
  const rows = await db
    .select()
    .from(renderCache)
    .where(and(eq(renderCache.specHash, specHash), inArray(renderCache.captureId, captureIds)))
  return new Map(rows.map((r) => [r.captureId, r]))
}

export async function insert(row: Omit<RenderCacheRecord, 'createdAt'>): Promise<void> {
  await db.insert(renderCache).values(row).onConflictDoNothing()
}

/** Bytes of cached frames the account holds — part of its storage figure. */
export async function bytesForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ bytes: sql<number>`coalesce(sum(${renderCache.size}), 0)::bigint` })
    .from(renderCache)
    .where(eq(renderCache.userId, userId))
  return Number(rows[0]?.bytes ?? 0)
}

/** Entries past retention, oldest first. */
export async function findOlderThan(before: Date, limit = 200): Promise<RenderCacheRecord[]> {
  return db.select().from(renderCache).where(lt(renderCache.createdAt, before)).orderBy(renderCache.createdAt).limit(limit)
}

export async function remove(specHash: string, captureId: string): Promise<void> {
  await db.delete(renderCache).where(and(eq(renderCache.specHash, specHash), eq(renderCache.captureId, captureId)))
}

/** Cached frame bytes per account, in one grouped query (FE-35). */
export async function bytesByUser(): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: renderCache.userId, bytes: sql<number>`coalesce(sum(${renderCache.size}), 0)::bigint` })
    .from(renderCache)
    .groupBy(renderCache.userId)
  return new Map(rows.map((r) => [r.userId, Number(r.bytes)]))
}
