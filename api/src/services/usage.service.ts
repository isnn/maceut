import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import * as userRepo from '../repositories/user.repository'
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

  /** Null until the captures table exists. */
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
  nextCaptureNote: string
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

/** 0 = Monday … 6 = Sunday, matching how windows store their days. */
function wibWeekday(now: Date): number {
  const wib = new Date(now.getTime() + WIB_OFFSET_MINUTES * 60_000)
  return (wib.getUTCDay() + 6) % 7
}

function parseHHMM(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
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

    capturesToday: null,
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

  // --- next capture, derived from the windows themselves ---
  const now = new Date()
  const nowMinutes = nowInWibMinutes(now)
  const today = wibWeekday(now)

  let next: { at: number; dayOffset: number } | null = null

  for (let offset = 0; offset < 8; offset++) {
    const day = (today + offset) % 7

    for (const s of active) {
      if (!s.days.includes(day)) continue

      const start = parseHHMM(s.startTime)
      const end = parseHHMM(s.endTime)
      if (start === null || end === null) continue

      // Candidate fire times inside the window. Daily fires once, at the start.
      const step = s.interval === '15min' ? 15 : 60
      const candidates: number[] =
        s.interval === 'daily'
          ? [start]
          : Array.from({ length: Math.max(Math.ceil((end - start) / step), 0) }, (_, i) => start + i * step)

      for (const at of candidates) {
        // Today, only times still ahead of us count.
        if (offset === 0 && at <= nowMinutes) continue
        if (!next || offset < next.dayOffset || (offset === next.dayOffset && at < next.at)) {
          next = { at, dayOffset: offset }
        }
      }
    }
    if (next) break
  }

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

  const upcoming = next as { at: number; dayOffset: number } | null

  function describeNext(): string {
    if (!upcoming) {
      return active.length === 0 ? 'Belum ada jendela aktif' : 'Tidak ada jadwal dalam 7 hari ke depan'
    }
    const when =
      upcoming.dayOffset === 0 ? 'hari ini' : upcoming.dayOffset === 1 ? 'besok' : `${upcoming.dayOffset} hari lagi`
    return `${when} · ${collecting.length} zona`
  }

  return {
    status,
    nextCaptureAt: upcoming ? formatHHMM(upcoming.at) : null,
    nextCaptureNote: describeNext(),
    roadsReporting,
    missedCaptures: null,
    peakIndex: null,
    peakAt: null,
  }
}
