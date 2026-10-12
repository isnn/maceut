export type CaptureInterval = '15min' | 'hourly' | 'daily'

/** One collection window on the Schedule board (3j). */
export interface CaptureWindow {
  id: string
  zoneId: string
  label: string
  /** "HH:mm" in Asia/Jakarta. */
  start: string
  end: string
  interval: CaptureInterval
  /** 0 = Monday … 6 = Sunday. */
  days: number[]
  active: boolean
  /** Paused by a plan change (ADR-020), not by the user. */
  pausedByPlan: boolean
  /** Frames this window has collected, shown when editing (3l). */
  capturedFrames: number
  /** When the scheduler fires it next (ISO). Null when paused or not yet seeded. */
  nextFireAt: string | null
  createdAt: string
}

export interface CreateWindowInput {
  zoneId: string
  label: string
  start: string
  end: string
  interval: CaptureInterval
  days: number[]
}

export const INTERVAL_LABEL: Record<CaptureInterval, string> = {
  '15min': '15 minutes',
  hourly: 'Hourly',
  daily: 'Daily',
}

/** Frames a window yields on a day it runs; ×days×52÷12 gives its month (framesPerMonth). */
export const INTERVAL_PER_HOUR: Record<CaptureInterval, number> = {
  '15min': 4,
  hourly: 1,
  daily: 0,
}

export const DAY_LABEL = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
export const DAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Frames a window takes from the monthly pool in an average month: a week's frames × 52
 * ÷ 12 (delivery doc F6). Must match `framesPerMonth` in api/src/types/schedule.ts.
 */
export function framesPerMonth(window: Pick<CaptureWindow, 'start' | 'end' | 'interval' | 'days'>): number {
  return Math.round((framesPerDay(window) * window.days.length * 52) / 12)
}

export function framesPerDay(window: Pick<CaptureWindow, 'start' | 'end' | 'interval'>): number {
  if (window.interval === 'daily') return 1

  // Must match api/src/types/schedule.ts exactly: it feeds the monthly projection shown
  // against the pool, and if the two disagree the board's warning and the server part.
  //
  // It previously read only the HOUR digits, so 07:30–09:00 counted as two full hours
  // and any window inside a single hour counted as zero — the second of which made
  // short windows look free against BR-006.
  const [sh = 0, sm = 0] = window.start.split(':').map(Number)
  const [eh = 0, em = 0] = window.end.split(':').map(Number)
  const minutes = eh * 60 + em - (sh * 60 + sm)

  const step = window.interval === '15min' ? 15 : 60
  return Math.max(Math.ceil(minutes / step), 0)
}
