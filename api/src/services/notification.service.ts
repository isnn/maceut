import { config } from '../config/env'
import * as notificationRepo from '../repositories/notification.repository'
import * as captureRepo from '../repositories/capture.repository'
import * as exportRepo from '../repositories/export.repository'
import * as userRepo from '../repositories/user.repository'
import * as zoneRepo from '../repositories/zone.repository'
import { getEmailProvider } from '../lib/email'
import { NotFoundError } from '../errors'
import { PLAN_LIMITS, type Plan } from '../types/plan'
import {
  captureProblemsEmail,
  hereBudgetEmail,
  planChangedEmail,
  sendLogged,
  type FailingZone,
} from './email.service'
import type { NewNotification, NotificationRecord } from '../repositories/notification.repository'

/**
 * Notifications (NOTIF): the bell, and the few emails worth their cost.
 *
 * ## The rule
 *
 * Everything is in-app (free). An email goes out only when the user has to act or is
 * losing data, is probably not in the app, AND the problem outlasts a delay:
 *
 * | event                        | in-app | email                                          |
 * |------------------------------|--------|------------------------------------------------|
 * | scheduled capture failing    | yes    | if still failing 2 h later and not read in app; one digest, ≤1/user/day |
 * | capture recovered            | yes    | —                                              |
 * | captures missed (our outage) | yes    | — (nothing the user can do)                    |
 * | daily limit reached / at 80% | yes    | — (only manual captures reach it; user is here)|
 * | export ready / failed        | yes    | —                                              |
 * | plan changed                 | yes    | only when staff made the change                |
 * | HERE budget 80% / reached    | staff  | to the one alert address on the HERE page      |
 *
 * ## Mechanics
 *
 * Every event is a row with a `dedupe_key`; writing the same event twice inserts
 * nothing, so emitters can report freely (a retried job, a zone on its fifth failed
 * hour). Rows that may email start `pending` with `email_due_at`; the email sweep
 * decides at that time — see `runEmailSweep`.
 *
 * Every `on*` function swallows its own errors: a notification must never fail the
 * capture, export or plan change that caused it.
 */

/** How long a failing zone waits before it may email — most HERE blips clear sooner. */
export const CAPTURE_FAILING_EMAIL_DELAY_MS = 2 * 60 * 60 * 1000
/** Share of the daily capture limit at which the "almost at your limit" note appears. */
export const NEAR_LIMIT_AT = 0.8
/** Email attempts before a pending row gives up. */
export const MAX_EMAIL_ATTEMPTS = 3
/** How long the bell keeps a notification. */
export const RETENTION_DAYS = 90

type Draft = Omit<NewNotification, 'id' | 'createdAt' | 'readAt' | 'emailedAt' | 'emailAttempts' | 'emailSkipReason'>

async function write(draft: Draft, label: string): Promise<NotificationRecord | undefined> {
  try {
    return await notificationRepo.insertOnce(draft)
  } catch (err) {
    console.error(`[notify] ${label} not recorded:`, err instanceof Error ? err.message : err)
    return undefined
  }
}

function wibTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(d) + ' WIB'
}

function wibDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Midnight WIB of `d`'s WIB day, as an instant. */
function wibDayStart(d: Date): Date {
  return new Date(`${wibDay(d)}T00:00:00+07:00`)
}

// --- captures ------------------------------------------------------------------------

interface SettledCapture {
  id: string
  userId: string
  zoneId: string
  trigger: string
  capturedAt: Date
  error?: string | null
}

/**
 * A scheduled capture failed. Notifies only when this STARTS a failure streak — the
 * zone's previous settled scheduled cycle was a success (or there was none). A zone
 * failing all day is one notification, not one per hour. Manual captures don't notify:
 * whoever pressed the button is watching the result.
 */
export async function onCaptureFailed(capture: SettledCapture, zoneName: string): Promise<void> {
  if (capture.trigger !== 'scheduled') return
  try {
    const previous = await captureRepo.lastSettledScheduled(capture.zoneId, {
      before: capture.capturedAt,
      excludeId: capture.id,
    })
    if (previous?.status === 'failed') return // the streak already notified

    await write(
      {
        userId: capture.userId,
        type: 'capture_failing',
        tone: 'warning',
        title: `${zoneName} stopped collecting`,
        body: `The ${wibTime(capture.capturedAt)} capture failed. We’re retrying — no action needed.`,
        actionLabel: 'View zone',
        actionHref: `/zones/${capture.zoneId}`,
        data: {
          zoneId: capture.zoneId,
          zoneName,
          captureId: capture.id,
          failedAt: capture.capturedAt.toISOString(),
          error: capture.error ?? null,
        },
        dedupeKey: `capture-failing:${capture.zoneId}:${capture.id}`,
        emailStatus: 'pending',
        emailDueAt: new Date(capture.capturedAt.getTime() + CAPTURE_FAILING_EMAIL_DELAY_MS),
      },
      'capture_failing',
    )
  } catch (err) {
    console.error('[notify] capture_failing check failed:', err instanceof Error ? err.message : err)
  }
}

/** A scheduled capture succeeded right after a failure streak: say it's working again. */
export async function onCaptureDone(capture: SettledCapture, zoneName: string): Promise<void> {
  if (capture.trigger !== 'scheduled') return
  try {
    const previous = await captureRepo.lastSettledScheduled(capture.zoneId, {
      before: capture.capturedAt,
      excludeId: capture.id,
    })
    if (previous?.status !== 'failed') return

    await write(
      {
        userId: capture.userId,
        type: 'capture_recovered',
        tone: 'success',
        title: `${zoneName} is collecting again`,
        body: `Back to normal since ${wibTime(capture.capturedAt)}.`,
        actionLabel: 'View zone',
        actionHref: `/zones/${capture.zoneId}`,
        data: { zoneId: capture.zoneId, zoneName, captureId: capture.id },
        dedupeKey: `capture-recovered:${capture.zoneId}:${capture.id}`,
      },
      'capture_recovered',
    )
  } catch (err) {
    console.error('[notify] capture_recovered check failed:', err instanceof Error ? err.message : err)
  }
}

export interface MissedSummary {
  zoneIds: string[]
  /** Firings swallowed by the outage, across those zones. */
  occurrences: number
  /** The earliest missed firing. */
  from: Date
}

/** Our scheduler was down. One notification per user per outage (per scheduler pass). */
export async function onCapturesMissed(userId: string, missed: MissedSummary, detectedAt: Date): Promise<void> {
  let zones = `${missed.zoneIds.length} zones`
  if (missed.zoneIds.length === 1) {
    const zone = await zoneRepo.findById(missed.zoneIds[0]!).catch(() => undefined)
    zones = zone?.name ?? 'your zone'
  }
  await write(
    {
      userId,
      type: 'captures_missed',
      tone: 'info',
      title: `${missed.occurrences} ${missed.occurrences === 1 ? 'capture' : 'captures'} missed`,
      body: `${zones}, from ${wibTime(missed.from)}.`,
      actionLabel: 'View zones',
      actionHref: '/zones',
      data: { zoneIds: missed.zoneIds, occurrences: missed.occurrences, from: missed.from.toISOString() },
      dedupeKey: `missed:${detectedAt.toISOString().slice(0, 16)}`,
    },
    'captures_missed',
  )
}

/** The daily capture limit refused a cycle. Once per WIB day. */
export async function onLimitReached(userId: string, plan: Plan, now: Date = new Date()): Promise<void> {
  const limit = PLAN_LIMITS[plan].capturesLimit
  await write(
    {
      userId,
      type: 'capture_limit_reached',
      tone: 'warning',
      title: 'Daily capture limit reached',
      body: `All ${limit} used. Captures resume at 00:00 WIB.`,
      actionLabel: 'View usage',
      actionHref: '/profile',
      data: { limit, day: wibDay(now) },
      dedupeKey: `limit-reached:${wibDay(now)}`,
    },
    'capture_limit_reached',
  )
}

/** Called after a capture is queued: notes, once a day, when usage crosses 80% of the limit. */
export async function onCaptureQueued(userId: string, plan: Plan, usedIncludingThis: number, now: Date = new Date()): Promise<void> {
  const limit = PLAN_LIMITS[plan].capturesLimit
  if (usedIncludingThis < Math.ceil(limit * NEAR_LIMIT_AT) || usedIncludingThis >= limit) return
  await write(
    {
      userId,
      type: 'capture_limit_near',
      tone: 'info',
      title: 'Almost at your daily limit',
      body: `${usedIncludingThis} of ${limit} captures used today. Extra captures are skipped until 00:00 WIB.`,
      actionLabel: 'View usage',
      actionHref: '/profile',
      data: { used: usedIncludingThis, limit, day: wibDay(now) },
      dedupeKey: `limit-near:${wibDay(now)}`,
    },
    'capture_limit_near',
  )
}

// --- exports -------------------------------------------------------------------------

/** An export finished — done or failed. In-app only (the user asked; the page shows a toast). */
export async function onExportFinished(exportId: string): Promise<void> {
  try {
    const row = await exportRepo.findById(exportId)
    if (!row || (row.status !== 'done' && row.status !== 'failed')) return
    const zoneName = (row.spec as { zoneName?: string }).zoneName ?? 'your zone'
    const kind = row.format === 'zip' ? 'Frames ZIP' : 'Animation'
    const done = row.status === 'done'
    await write(
      {
        userId: row.userId,
        type: done ? 'export_ready' : 'export_failed',
        tone: done ? 'success' : 'warning',
        title: done ? `${kind} ready · ${zoneName}` : `${kind} didn’t finish · ${zoneName}`,
        body: done ? 'Download it within 7 days.' : 'Retry it from the zone page.',
        actionLabel: done ? 'Download' : 'Retry',
        actionHref: `/zones/${row.zoneId}#exports`,
        data: { exportId: row.id, zoneId: row.zoneId, zoneName, format: row.format },
        dedupeKey: `export-${done ? 'done' : 'failed'}:${row.id}`,
      },
      'export_finished',
    )
  } catch (err) {
    console.error('[notify] export check failed:', err instanceof Error ? err.message : err)
  }
}

// --- plan ----------------------------------------------------------------------------

const PLAN_NAME: Record<Plan, string> = { free: 'Free', standard: 'Standard', premium: 'Premium' }

/**
 * A plan changed. Emails only when STAFF made the change: someone changing their own
 * plan is on the page that did it. Paused items are listed (ADR-020).
 */
export async function onPlanChanged(
  userId: string,
  change: { from: Plan; to: Plan; paused: string[]; byStaff: boolean },
  now: Date = new Date(),
): Promise<void> {
  if (change.from === change.to) return
  const up = PLAN_LIMITS[change.to].capturesLimit > PLAN_LIMITS[change.from].capturesLimit
  const pausedText = change.paused.length
    ? ` Paused to fit: ${change.paused.join(', ')}. Nothing was deleted.`
    : ' New limits apply now.'
  await write(
    {
      userId,
      type: 'plan_changed',
      tone: up ? 'success' : 'info',
      title: `Your plan is now ${PLAN_NAME[change.to]}`,
      body: `${change.byStaff ? 'Changed by the Maceut team.' : `Changed from ${PLAN_NAME[change.from]}.`}${pausedText}`,
      actionLabel: 'View plan',
      actionHref: '/profile',
      data: { from: change.from, to: change.to, paused: change.paused },
      dedupeKey: `plan:${change.from}->${change.to}:${now.toISOString()}`,
      emailStatus: change.byStaff ? 'pending' : 'none',
      emailDueAt: change.byStaff ? now : null,
    },
    'plan_changed',
  )
}

// --- HERE budget (staff) ----------------------------------------------------------------

export interface HereBudgetAlert {
  level: 'warning' | 'reached'
  period: 'daily' | 'monthly'
  used: number
  limit: number
  /** WIB day ("2026-09-28") or month start ("2026-09-01") — one alert per level per period. */
  periodKey: string
  alertEmail: string | null
}

/**
 * HERE usage crossed 80% of a cap, or reached it. Every staff account sees it in the
 * bell; one email goes to the alert address staff set on the HERE page (if any).
 *
 * Callers hit this on every metered call past the threshold, so it remembers what it
 * has already sent in this process and returns without touching the database.
 */
const hereAlertsSeen = new Set<string>()

export async function onHereBudget(alert: HereBudgetAlert): Promise<void> {
  const key = `here-budget:${alert.level}:${alert.period}:${alert.periodKey}`
  if (hereAlertsSeen.has(key)) return
  hereAlertsSeen.add(key)

  const pct = Math.round((alert.used / alert.limit) * 100)
  const periodWord = alert.period === 'daily' ? 'daily' : 'monthly'
  const used = `${alert.used.toLocaleString('en-US')} of ${alert.limit.toLocaleString('en-US')} requests`
  const title =
    alert.level === 'reached' ? `HERE ${periodWord} cap reached` : `HERE at ${pct}% of the ${periodWord} cap`
  const body =
    alert.level === 'reached'
      ? `${used}. Captures stop until the ${alert.period === 'daily' ? 'day' : 'month'} resets — raise the cap to resume.`
      : `${used}. Raise the cap if captures should keep running.`

  try {
    const staff = await userRepo.listInternalIds(config.internalEmails)
    for (const userId of staff) {
      await write(
        {
          userId,
          type: alert.level === 'reached' ? 'here_budget_reached' : 'here_budget_warning',
          tone: alert.level === 'reached' ? 'warning' : 'info',
          title,
          body,
          actionLabel: 'View usage',
          actionHref: '/internal/here',
          data: { ...alert },
          dedupeKey: key,
        },
        'here_budget',
      )
    }

    // One email per alert, across processes: claimed by key in email_log.
    if (alert.alertEmail && (await notificationRepo.claimEmail(key, alert.alertEmail, 'here-budget', getEmailProvider().name))) {
      await sendLogged(hereBudgetEmail(alert.alertEmail, { title, body }), 'here-budget', key)
    }
  } catch (err) {
    hereAlertsSeen.delete(key) // let the next call try again
    console.error('[notify] HERE budget alert failed:', err instanceof Error ? err.message : err)
  }
}

// --- the bell (API) -------------------------------------------------------------------

export interface PublicNotification {
  id: string
  type: NotificationRecord['type']
  tone: NotificationRecord['tone']
  title: string
  body: string
  actionLabel: string | null
  actionHref: string | null
  /** The zone it's about, when it's about one — lets the bell group "3 zones stopped collecting". */
  zoneName: string | null
  read: boolean
  createdAt: string
}

export function toPublic(row: NotificationRecord): PublicNotification {
  return {
    id: row.id,
    type: row.type,
    tone: row.tone,
    title: row.title,
    body: row.body,
    actionLabel: row.actionLabel,
    actionHref: row.actionHref,
    zoneName: typeof row.data.zoneName === 'string' ? row.data.zoneName : null,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listForUser(userId: string, limit = 20): Promise<{ items: PublicNotification[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    notificationRepo.listForUser(userId, limit),
    notificationRepo.unreadCount(userId),
  ])
  return { items: rows.map(toPublic), unreadCount }
}

export async function markRead(userId: string, id: string): Promise<void> {
  if (!(await notificationRepo.markRead(userId, id))) throw new NotFoundError('Notifikasi')
}

export async function markAllRead(userId: string): Promise<{ marked: number }> {
  return { marked: await notificationRepo.markAllRead(userId) }
}

export const getPreferences = notificationRepo.getPreferences

export async function updatePreferences(userId: string, prefs: notificationRepo.Preferences): Promise<notificationRepo.Preferences> {
  return notificationRepo.setPreferences(userId, prefs)
}

// --- the email sweep -------------------------------------------------------------------

export interface EmailSweepResult {
  sent: number
  skipped: number
  failed: number
}

/**
 * Decides every pending email that has come due. Runs every 10 minutes in the API
 * process (schedulers/notification.sweeper).
 *
 * Capture failures, per user, are dropped when: read in the app first, the zone
 * recovered, the user switched them off, or they were already emailed today. What's
 * left becomes ONE email listing every still-failing zone.
 *
 * A provider error leaves rows pending for the next pass, up to MAX_EMAIL_ATTEMPTS.
 */
export async function runEmailSweep(now: Date = new Date()): Promise<EmailSweepResult> {
  const result: EmailSweepResult = { sent: 0, skipped: 0, failed: 0 }
  const due = await notificationRepo.findDueEmails(now)
  if (!due.length) return result

  const byUser = new Map<string, NotificationRecord[]>()
  for (const row of due) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row])

  const skip = async (rows: NotificationRecord[], reason: string) => {
    await notificationRepo.markEmailSkipped(rows.map((r) => r.id), reason)
    result.skipped += rows.length
  }

  for (const [userId, rows] of byUser) {
    try {
      const account = await userRepo.findById(userId)
      if (!account) {
        await skip(rows, 'no_user')
        continue
      }

      // Staff-made plan changes: an account notice, sent regardless of preferences.
      for (const row of rows.filter((r) => r.type === 'plan_changed')) {
        const ok = await sendLogged(planChangedEmail(account.email, { title: row.title, body: row.body }), 'plan-changed')
        if (ok) {
          await notificationRepo.markEmailSent([row.id], now)
          result.sent++
        } else {
          await notificationRepo.recordEmailAttemptFailed([row.id], MAX_EMAIL_ATTEMPTS)
          result.failed++
        }
      }

      const failing = rows.filter((r) => r.type === 'capture_failing')
      if (!failing.length) continue

      const unread = failing.filter((r) => r.readAt === null)
      await skip(failing.filter((r) => r.readAt !== null), 'read_in_app')
      if (!unread.length) continue

      // Still failing = the zone's latest settled scheduled cycle is a failure.
      const stillFailing: NotificationRecord[] = []
      const resolved: NotificationRecord[] = []
      for (const row of unread) {
        const zoneId = String(row.data.zoneId)
        const latest = await captureRepo.lastSettledScheduled(zoneId)
        if (latest?.status === 'failed') stillFailing.push(row)
        else resolved.push(row)
      }
      await skip(resolved, 'resolved')
      if (!stillFailing.length) continue

      const prefs = await notificationRepo.getPreferences(userId)
      if (!prefs.emailCaptureProblems) {
        await skip(stillFailing, 'switched_off')
        continue
      }
      if ((await notificationRepo.countSent(account.email, 'capture-problems', wibDayStart(now))) > 0) {
        await skip(stillFailing, 'daily_cap')
        continue
      }

      const zones: FailingZone[] = stillFailing.map((r) => ({
        zoneId: String(r.data.zoneId),
        zoneName: String(r.data.zoneName ?? 'Zone'),
        // When the capture failed, not when this row was written (they differ after a backlog).
        since: typeof r.data.failedAt === 'string' ? new Date(r.data.failedAt) : r.createdAt,
        error: null,
      }))
      const ok = await sendLogged(captureProblemsEmail(account.email, zones), 'capture-problems')
      if (ok) {
        await notificationRepo.markEmailSent(stillFailing.map((r) => r.id), now)
        result.sent++
      } else {
        await notificationRepo.recordEmailAttemptFailed(stillFailing.map((r) => r.id), MAX_EMAIL_ATTEMPTS)
        result.failed++
      }
    } catch (err) {
      console.error(`[notify] email sweep for ${userId} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return result
}

/** Retention for the bell. */
export async function pruneOld(now: Date = new Date()): Promise<number> {
  return notificationRepo.deleteOlderThan(new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000))
}
