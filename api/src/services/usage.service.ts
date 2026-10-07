import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import * as userRepo from '../repositories/user.repository'
import * as captureRepo from '../repositories/capture.repository'
import * as exportRepo from '../repositories/export.repository'
import * as renderCacheRepo from '../repositories/render-cache.repository'
import { wibMonthStart } from './here-usage.service'
import { NotFoundError } from '../errors'
import { PLAN_LIMITS, type Plan } from '../types/plan'
import { framesPerDay, type CaptureInterval } from '../types/schedule'

/**
 * What the dashboard shows (F-19).
 *
 * Every figure here is either measured or `null`. Nothing is estimated, because a
 * dashboard's whole job is to be trusted at a glance — a plausible-looking number
 * that was invented is worse than a dash, since nobody thinks to check it.
 *
 * Every figure is now measured. The last `null`s — exports, storage, missed captures,
 * the day's peak — became real once exports (FE-21) and capture images (CAP-02)
 * existed. `null` is left only where there is genuinely nothing to report (no capture
 * collected today has a peak).
 */

export interface UsageSummary {
  plan: Plan

  zonesCount: number
  zonesLimit: number
  schedulesActiveCount: number
  schedulesLimit: number

  /** Frames the active windows will produce on their busiest day. */
  framesPerDay: number
  capturesLimit: number

  /** Measured since the captures table landed. */
  capturesToday: number | null
  /** Studio exports finished this WIB calendar month. */
  exportsThisMonth: number
  /** Capture images plus export files still held in R2. */
  storageUsedBytes: number
  storageUsedGb: number
  storageLimitGb: number

  /**
   * Zones and windows paused because they exceed the current plan (ADR-020).
   *
   * This is the piece that makes grandfathering visible. Without it a downgraded
   * account simply sees collection stop, with nothing anywhere explaining why.
   */
  pausedByPlan: { zones: number; schedules: number }
}

export interface CollectionHealth {
  status: 'healthy' | 'degraded' | 'idle'
  /** "HH:mm" in WIB, from the active windows. Null when nothing is scheduled. */
  nextCaptureAt: string | null
  /**
   * Whole days from now until that firing, on Jakarta's calendar. 0 = today.
   * Null alongside a null `nextCaptureAt`.
   *
   * Structured rather than a sentence: this used to return Indonesian prose — "5 hari
   * lagi · 13 zona" — straight into an English interface. Phrasing belongs to whoever
   * is doing the speaking, and that is not the API.
   */
  nextCaptureInDays: number | null
  /** How many zones that firing covers. */
  zonesCollecting: number
  /** Summed from zones' roadsCount; null while HERE is unavailable. */
  roadsReporting: number | null
  /** Collecting zones whose latest scheduled capture failed — a failure streak. */
  zonesFailing: number
  /** Today (WIB): captures that failed, and firings missed while the system was down. */
  problemsToday: { failed: number; missed: number }
  /** Today's highest mean jam factor (0–10) and when/where; null before any capture today. */
  peakIndex: number | null
  peakAt: string | null
  peakZoneName: string | null
}

const WIB_OFFSET_MINUTES = 7 * 60

/** Minutes since midnight in Jakarta, for "what runs next". */
function nowInWibMinutes(now: Date): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + WIB_OFFSET_MINUTES) % (24 * 60)
}

function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export async function getUsage(userId: string): Promise<UsageSummary> {
  const user = await userRepo.findByIdWithPlan(userId)
  if (!user) throw new NotFoundError('User')

  const limits = PLAN_LIMITS[user.plan]
  const [zones, schedules] = await Promise.all([
    zoneRepo.findByUserId(userId),
    scheduleRepo.findByUserId(userId),
  ])

  const activeSchedules = schedules.filter((s) => s.status === 'active')

  const now = new Date()
  const [capturesToday, exportsThisMonth, imageBytes, exportBytes, cacheBytes] = await Promise.all([
    // BR-006 counts per WIB calendar day, and excludes rows that record a refusal.
    captureRepo.countForWibDay(userId, now),
    exportRepo.countDoneSince(userId, new Date(`${wibMonthStart(now)}T00:00:00+07:00`)),
    captureRepo.imageBytesForUser(userId),
    exportRepo.fileBytesForUser(userId),
    // Frames kept for reuse (EXP-A2) are files in R2 too, for up to 7 days.
    renderCacheRepo.bytesForUser(userId),
  ])
  const storageUsedBytes = imageBytes + exportBytes + cacheBytes

  // The busiest day, not the sum across the week — the daily limit is per day, and a
  // window that only runs on Sunday costs Monday nothing.
  let busiestDay = 0
  for (let day = 0; day < 7; day++) {
    let frames = 0
    for (const s of activeSchedules) {
      if (!s.days.includes(day)) continue
      frames += framesPerDay({
        start: s.startTime,
        end: s.endTime,
        interval: s.interval as CaptureInterval,
        days: s.days,
      })
    }
    if (frames > busiestDay) busiestDay = frames
  }

  return {
    plan: user.plan,
    zonesCount: zones.filter((z) => z.status === 'collecting').length,
    zonesLimit: limits.zonesLimit,
    schedulesActiveCount: activeSchedules.length,
    schedulesLimit: limits.schedulesLimit,
    framesPerDay: busiestDay,
    capturesLimit: limits.capturesLimit,

    capturesToday,
    exportsThisMonth,
    storageUsedBytes,
    storageUsedGb: Math.round((storageUsedBytes / 1024 ** 3) * 100) / 100,
    storageLimitGb: limits.storageGb,

    pausedByPlan: {
      zones: zones.filter((z) => z.status === 'paused').length,
      schedules: schedules.filter((s) => s.status === 'paused').length,
    },
  }
}

export async function getCollectionHealth(userId: string): Promise<CollectionHealth> {
  const [zones, schedules] = await Promise.all([
    zoneRepo.findByUserId(userId),
    scheduleRepo.findByUserId(userId),
  ])

  const active = schedules.filter((s) => s.status === 'active')
  const collecting = zones.filter((z) => z.status === 'collecting')

  // --- next capture: the instant the scheduler will actually act on ---
  //
  // Read from `schedules.next_fire_at` rather than re-derived from the window. The
  // scheduler claims rows by that column, so anything computed separately here would be
  // a prediction of what the system *should* do; this is what it *will* do. They agreed
  // while both were derived from the same rule — but only one of them is the thing that
  // fires, and a dashboard that disagrees with the scheduler is worse than no dashboard.
  const now = new Date()
  const nextFire = await scheduleRepo.earliestDueForUser(userId)

  // --- roads reporting, from what HERE told us when each zone was made ---
  const withRoads = collecting.filter((z) => z.roadsCount !== null)
  const roadsReporting =
    withRoads.length > 0 ? withRoads.reduce((sum, z) => sum + (z.roadsCount ?? 0), 0) : null

  // Only what the PLAN paused counts against health (ADR-020). A zone the user paused
  // is doing exactly what they asked; calling it a problem would cry wolf.
  const pausedByPlanCount =
    zones.filter((z) => z.status === 'paused' && z.pausedByPlan).length +
    schedules.filter((s) => s.status === 'paused' && s.pausedByPlan).length

  // A zone is failing when its latest scheduled capture failed — the same rule as the
  // "stopped collecting" notification and the zone page banner (NOTIF).
  const latest = await Promise.all(collecting.map((z) => captureRepo.lastSettledScheduled(z.id)))
  const zonesFailing = latest.filter((c) => c?.status === 'failed').length

  const [problemsToday, peak] = await Promise.all([
    captureRepo.problemsForWibDay(userId, now),
    captureRepo.peakForWibDay(userId, now),
  ])

  // `idle` is not a failure — an account that has not scheduled anything is working
  // exactly as configured, and calling that "degraded" would cry wolf.
  const status: CollectionHealth['status'] =
    active.length === 0 ? 'idle' : zonesFailing > 0 || pausedByPlanCount > 0 ? 'degraded' : 'healthy'


  return {
    status,
    nextCaptureAt: nextFire ? formatHHMM(nowInWibMinutes(nextFire)) : null,
    // Compared in Jakarta, because "today" and "tomorrow" are the user's days.
    nextCaptureInDays: nextFire ? wibDayOffset(now, nextFire) : null,
    zonesCollecting: collecting.length,
    roadsReporting,
    zonesFailing,
    problemsToday,
    peakIndex: peak ? Math.round(peak.jamFactorAvg * 10) / 10 : null,
    peakAt: peak ? formatHHMM(nowInWibMinutes(peak.capturedAt)) : null,
    peakZoneName: peak?.zoneName ?? null,
  }
}

/** Whole days between two instants, counted on Jakarta's calendar. */
function wibDayOffset(from: Date, to: Date): number {
  const dayOf = (d: Date) => Math.floor((d.getTime() + WIB_OFFSET_MINUTES * 60_000) / 86_400_000)
  return Math.max(dayOf(to) - dayOf(from), 0)
}
