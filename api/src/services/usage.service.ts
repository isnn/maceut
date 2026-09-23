import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import * as userRepo from '../repositories/user.repository'
import * as captureRepo from '../repositories/capture.repository'
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
 * `null` currently means "captures do not exist yet" (CAP-01) or "HERE is not
 * answering". Each one becomes a real number when its feature lands; no caller
 * changes.
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
  rendersThisMonth: number | null
  storageUsedGb: number | null
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
  /** Null until captures exist. */
  missedCaptures: number | null
  peakIndex: number | null
  peakAt: string | null
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

  // BR-006 counts per WIB calendar day, and excludes rows that record a refusal.
  const capturesToday = await captureRepo.countForWibDay(userId, new Date())

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
    rendersThisMonth: null,
    storageUsedGb: null,
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

  const pausedCount =
    zones.filter((z) => z.status === 'paused').length + schedules.filter((s) => s.status === 'paused').length

  // `idle` is not a failure — an account that has not scheduled anything is working
  // exactly as configured, and calling that "degraded" would cry wolf.
  const status: CollectionHealth['status'] =
    active.length === 0 ? 'idle' : pausedCount > 0 ? 'degraded' : 'healthy'



  return {
    status,
    nextCaptureAt: nextFire ? formatHHMM(nowInWibMinutes(nextFire)) : null,
    // Compared in Jakarta, because "today" and "tomorrow" are the user's days.
    nextCaptureInDays: nextFire ? wibDayOffset(now, nextFire) : null,
    zonesCollecting: collecting.length,
    roadsReporting,
    missedCaptures: null,
    peakIndex: null,
    peakAt: null,
  }
}

/** Whole days between two instants, counted on Jakarta's calendar. */
function wibDayOffset(from: Date, to: Date): number {
  const dayOf = (d: Date) => Math.floor((d.getTime() + WIB_OFFSET_MINUTES * 60_000) / 86_400_000)
  return Math.max(dayOf(to) - dayOf(from), 0)
}
