import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { hereUsage, platformSettings } from '../../drizzle/schema'

/** HERE usage counters and platform settings. Rules live in here-usage.service.ts. */

export type HereSource = 'capture' | 'preview' | 'road_counts' | 'zone_stats'
export const HERE_SOURCES: HereSource[] = ['capture', 'preview', 'road_counts', 'zone_stats']

export interface UsageCounts {
  requests: number
  failed: number
  refused: number
}

/** Adds to one day's counters for one source — creating the row on its first call. */
export async function increment(day: string, source: HereSource, by: Partial<UsageCounts>): Promise<void> {
  const requests = by.requests ?? 0
  const failed = by.failed ?? 0
  const refused = by.refused ?? 0
  await db
    .insert(hereUsage)
    .values({ day, source, requests, failed, refused })
    .onConflictDoUpdate({
      target: [hereUsage.day, hereUsage.source],
      set: {
        requests: sql`${hereUsage.requests} + ${requests}`,
        failed: sql`${hereUsage.failed} + ${failed}`,
        refused: sql`${hereUsage.refused} + ${refused}`,
        updatedAt: new Date(),
      },
    })
}

/** Totals across every source from `fromDay` (inclusive, WIB "YYYY-MM-DD") onward. */
export async function totalsSince(fromDay: string): Promise<UsageCounts> {
  const rows = await db
    .select({
      requests: sql<number>`coalesce(sum(${hereUsage.requests}), 0)::int`,
      failed: sql<number>`coalesce(sum(${hereUsage.failed}), 0)::int`,
      refused: sql<number>`coalesce(sum(${hereUsage.refused}), 0)::int`,
    })
    .from(hereUsage)
    .where(gte(hereUsage.day, fromDay))
  return rows[0] ?? { requests: 0, failed: 0, refused: 0 }
}

/** Totals for exactly one day. */
export async function totalsOn(day: string): Promise<UsageCounts> {
  const rows = await db
    .select({
      requests: sql<number>`coalesce(sum(${hereUsage.requests}), 0)::int`,
      failed: sql<number>`coalesce(sum(${hereUsage.failed}), 0)::int`,
      refused: sql<number>`coalesce(sum(${hereUsage.refused}), 0)::int`,
    })
    .from(hereUsage)
    .where(eq(hereUsage.day, day))
  return rows[0] ?? { requests: 0, failed: 0, refused: 0 }
}

/** Every per-source row from `fromDay` on, oldest first — the admin chart. */
export async function rowsSince(fromDay: string) {
  return db
    .select({
      day: hereUsage.day,
      source: hereUsage.source,
      requests: hereUsage.requests,
      failed: hereUsage.failed,
      refused: hereUsage.refused,
    })
    .from(hereUsage)
    .where(and(gte(hereUsage.day, fromDay)))
    .orderBy(asc(hereUsage.day))
}

export async function getSetting(key: string): Promise<{ value: unknown; updatedAt: Date; updatedBy: string | null } | undefined> {
  const rows = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1)
  return rows[0]
}

export async function setSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  const now = new Date()
  await db
    .insert(platformSettings)
    .values({ key, value, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: now, updatedBy } })
}
