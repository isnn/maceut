import { and, desc, eq, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { emailLog, notificationPreferences, notifications } from '../../drizzle/schema'

/** Notification, preference and email-log data access. Rules live in the service (BR-007). */

export type NotificationRecord = typeof notifications.$inferSelect
export type NotificationType = NotificationRecord['type']
export type NewNotification = typeof notifications.$inferInsert

/** Inserts unless (user, dedupe key) already exists. Returns the row only when it is new. */
export async function insertOnce(row: NewNotification): Promise<NotificationRecord | undefined> {
  const rows = await db
    .insert(notifications)
    .values(row)
    .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
    .returning()
  return rows[0]
}

export async function listForUser(userId: string, limit: number): Promise<NotificationRecord[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
}

export async function unreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  return rows[0]?.count ?? 0
}

/** Marks one read. False when it isn't this user's (or doesn't exist). */
export async function markRead(userId: string, id: string, at: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: at })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id })
  return rows.length > 0
}

export async function markAllRead(userId: string, at: Date = new Date()): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: at })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id })
  return rows.length
}

/** Pending emails whose delay has run out, oldest first. */
export async function findDueEmails(now: Date, limit = 200): Promise<NotificationRecord[]> {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.emailStatus, 'pending'), lte(notifications.emailDueAt, now)))
    .orderBy(notifications.emailDueAt)
    .limit(limit)
}

export async function markEmailSent(ids: string[], at: Date): Promise<void> {
  if (!ids.length) return
  await db.update(notifications).set({ emailStatus: 'sent', emailedAt: at }).where(inArray(notifications.id, ids))
}

export async function markEmailSkipped(ids: string[], reason: string): Promise<void> {
  if (!ids.length) return
  await db.update(notifications).set({ emailStatus: 'skipped', emailSkipReason: reason }).where(inArray(notifications.id, ids))
}

/** One more failed attempt; after `maxAttempts` the row gives up as skipped. */
export async function recordEmailAttemptFailed(ids: string[], maxAttempts: number): Promise<void> {
  if (!ids.length) return
  await db
    .update(notifications)
    .set({
      emailAttempts: sql`${notifications.emailAttempts} + 1`,
      emailStatus: sql`CASE WHEN ${notifications.emailAttempts} + 1 >= ${maxAttempts} THEN 'skipped'::notification_email_status ELSE 'pending'::notification_email_status END`,
      emailSkipReason: sql`CASE WHEN ${notifications.emailAttempts} + 1 >= ${maxAttempts} THEN 'provider_error' ELSE NULL END`,
    })
    .where(inArray(notifications.id, ids))
}

/** Retention: the bell keeps 90 days. */
export async function deleteOlderThan(before: Date): Promise<number> {
  const rows = await db.delete(notifications).where(lt(notifications.createdAt, before)).returning({ id: notifications.id })
  return rows.length
}

// --- preferences ---------------------------------------------------------------------

export interface Preferences {
  emailCaptureProblems: boolean
}

export const DEFAULT_PREFERENCES: Preferences = { emailCaptureProblems: true }

export async function getPreferences(userId: string): Promise<Preferences> {
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1)
  return rows[0] ? { emailCaptureProblems: rows[0].emailCaptureProblems } : DEFAULT_PREFERENCES
}

export async function setPreferences(userId: string, prefs: Preferences): Promise<Preferences> {
  const now = new Date()
  await db
    .insert(notificationPreferences)
    .values({ userId, ...prefs, updatedAt: now })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...prefs, updatedAt: now } })
  return prefs
}

// --- email log -----------------------------------------------------------------------

export type EmailLogStatus = 'sent' | 'failed' | 'suppressed'

export async function logEmail(entry: {
  to: string
  category: string
  status: EmailLogStatus
  provider: string
  error?: string | null
  dedupeKey?: string | null
}): Promise<void> {
  await db.insert(emailLog).values({ ...entry, to: entry.to.toLowerCase() })
}

/**
 * Claims a one-time email by its key. True = this caller owns the send; false = it
 * already went (or is going) out. The claim row is later updated with the outcome.
 */
export async function claimEmail(dedupeKey: string, to: string, category: string, provider: string): Promise<boolean> {
  const rows = await db
    .insert(emailLog)
    .values({ to: to.toLowerCase(), category, dedupeKey, status: 'sent', provider })
    .onConflictDoNothing({ target: emailLog.dedupeKey })
    .returning({ id: emailLog.id })
  return rows.length > 0
}

export async function setEmailOutcome(dedupeKey: string, status: EmailLogStatus, error?: string): Promise<void> {
  await db.update(emailLog).set({ status, error: error ?? null }).where(eq(emailLog.dedupeKey, dedupeKey))
}

/** Emails actually sent to an address in a category since `since` (suppressed ones don't count). */
export async function countSent(to: string, category: string, since: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailLog)
    .where(and(eq(emailLog.to, to.toLowerCase()), eq(emailLog.category, category), eq(emailLog.status, 'sent'), sql`${emailLog.createdAt} >= ${since}`))
  return rows[0]?.count ?? 0
}
