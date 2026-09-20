/**
 * Capture windows (F-05/F-06).
 *
 * The spec described schedules as cron expressions; the Schedule board edits a window
 * — start time, end time, an interval and weekdays. The window is stored, and cron is
 * derived from it when the scheduler loads.
 *
 * That direction is chosen deliberately. Window → cron is total: every window has
 * exactly one cron form. Cron → window is not: `0 3,17 * * *` has no window
 * representation at all. Storing cron would mean the UI could not reliably render
 * what the user saved, so the lossy conversion happens in memory and never in the
 * database.
 */

export type CaptureInterval = '15min' | 'hourly' | 'daily'
export type ScheduleStatus = 'active' | 'paused' | 'deleted'

export const CAPTURE_INTERVALS: readonly CaptureInterval[] = ['15min', 'hourly', 'daily'] as const

/** Frames each interval yields per hour. `daily` is special-cased — one per day. */
export const INTERVAL_PER_HOUR: Record<CaptureInterval, number> = {
  '15min': 4,
  hourly: 1,
  daily: 0,
}

/** Interval a plan is allowed to pick — the tier's headline differentiator. */
export const PLAN_MIN_INTERVAL: Record<'free' | 'standard' | 'premium', CaptureInterval[]> = {
  free: ['daily'],
  standard: ['daily', 'hourly'],
  premium: ['daily', 'hourly', '15min'],
}

export interface WindowShape {
  start: string
  end: string
  interval: CaptureInterval
  days: number[]
}

/** "HH:mm" → minutes since midnight, or null when malformed. */
export function parseTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * Frames this window produces on a day it runs.
 *
 * Mirrors `framesPerDay` in web/src/features/schedules/types.ts — the board shows this
 * number against the plan's daily capture budget, so the two must agree or the UI
 * promises a budget the server does not enforce.
 */
export function framesPerDay(window: WindowShape): number {
  if (window.interval === 'daily') return 1

  const start = parseTime(window.start)
  const end = parseTime(window.end)
  if (start === null || end === null) return 0

  const hours = Math.max(Math.floor((end - start) / 60), 0)
  return hours * INTERVAL_PER_HOUR[window.interval]
}

/** Frames across a whole week — what the daily budget must be compared against per day. */
export function framesPerWeek(window: WindowShape): number {
  return framesPerDay(window) * window.days.length
}

/**
 * The cron expression the scheduler will register for this window.
 *
 * Days are the UI's 0 = Monday … 6 = Sunday; cron uses 0 = Sunday … 6 = Saturday, so
 * they are remapped. Getting that wrong shifts every schedule by a day, which is the
 * kind of bug that only shows up in production on a Monday.
 */
export function toCron(window: WindowShape): string {
  const start = parseTime(window.start) ?? 0
  const end = parseTime(window.end) ?? 0
  const startHour = Math.floor(start / 60)
  const endHour = Math.floor(end / 60)

  const cronDays = window.days.length === 7 ? '*' : window.days.map((d) => (d + 1) % 7).sort((a, b) => a - b).join(',')

  if (window.interval === 'daily') {
    return `${start % 60} ${startHour} * * ${cronDays}`
  }

  // The window is half-open: an 07:00–09:00 hourly window fires at 07 and 08, not 09.
  // Firing at the end hour would produce a frame outside the window the user drew.
  const lastHour = Math.max(endHour - 1, startHour)
  const hours = startHour === lastHour ? `${startHour}` : `${startHour}-${lastHour}`

  return window.interval === '15min' ? `0,15,30,45 ${hours} * * ${cronDays}` : `0 ${hours} * * ${cronDays}`
}
