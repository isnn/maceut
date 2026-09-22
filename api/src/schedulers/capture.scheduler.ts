import * as scheduleRepo from '../repositories/schedule.repository'
import * as captureService from '../services/capture.service'
import { parseTime, type CaptureInterval } from '../types/schedule'

/**
 * Turns stored capture windows into firings (F-05, ADR-019).
 *
 * Until this existed, a capture window was a row nobody read: the app stored it,
 * displayed it, counted it against the plan limit and predicted the next capture from
 * it — and nothing ever fired. The dashboard's "next capture 07:00" was a correct
 * prediction of an event that could not happen.
 *
 * ## Why a minute tick and not cron
 *
 * ADR-019 stores windows, not cron expressions, because the conversion is only total in
 * one direction. A cron library would mean deriving an expression per window, handing
 * it to a parser, and trusting the round trip — when the question each minute is simply
 * "is this minute one of this window's firing times?", which the window answers
 * directly.
 *
 * The tick aligns itself to the top of each minute rather than running every 60000ms
 * from an arbitrary start, so a firing time of 07:00 happens at 07:00 rather than
 * 07:00:37. Drift would otherwise accumulate across a long-running process.
 *
 * ## Why firing is idempotent per minute
 *
 * A tick that runs twice in the same minute — a slow previous pass, a clock adjustment —
 * must not double-capture. Each pass records the minute it handled and refuses to
 * repeat it. This is in-process state: one scheduler is assumed, which is true while the
 * API runs as a single container. Two API replicas would double-fire, and the fix then
 * is a lock in Postgres rather than a bigger comment.
 */

const MINUTE = 60_000
const WIB_OFFSET_MINUTES = 7 * 60

/** Minutes since midnight in Jakarta — the clock every window is written against. */
export function wibMinutes(now: Date): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + WIB_OFFSET_MINUTES) % (24 * 60)
}

/** 0 = Monday … 6 = Sunday, matching how windows store their days. */
export function wibWeekday(now: Date): number {
  const wib = new Date(now.getTime() + WIB_OFFSET_MINUTES * 60_000)
  return (wib.getUTCDay() + 6) % 7
}

export interface FirableWindow {
  startTime: string
  endTime: string
  interval: CaptureInterval
  days: number[]
}

/**
 * Does this window fire at this exact minute?
 *
 * The end of a window is exclusive. A 07:00–09:00 hourly window fires at 07:00 and
 * 08:00, not at 09:00 — otherwise "07:00 to 09:00" would quietly mean three hours of
 * capture, and the frame budget the plan limit was checked against would be wrong.
 */
export function firesAt(window: FirableWindow, now: Date): boolean {
  if (!window.days.includes(wibWeekday(now))) return false

  const start = parseTime(window.startTime)
  const end = parseTime(window.endTime)
  if (start === null || end === null) return false

  const minute = wibMinutes(now)
  if (minute < start || minute >= end) return false

  // Daily fires once, at the window's start.
  if (window.interval === 'daily') return minute === start

  const step = window.interval === '15min' ? 15 : 60
  return (minute - start) % step === 0
}

let lastHandledMinute: string | null = null
let timer: NodeJS.Timeout | null = null

/** A stable key for "which minute is this", in UTC so it cannot repeat. */
function minuteKey(now: Date): string {
  return now.toISOString().slice(0, 16)
}

/**
 * One pass: find the windows due this minute and start a cycle for each.
 *
 * Exported so it can be tested, and so an operator can trigger a pass by hand while
 * diagnosing a zone that is not collecting.
 */
export async function tick(now: Date = new Date()): Promise<{ fired: number; skipped: number }> {
  const key = minuteKey(now)
  if (lastHandledMinute === key) return { fired: 0, skipped: 0 }
  lastHandledMinute = key

  const active = await scheduleRepo.findAllActive()
  let fired = 0
  let skipped = 0

  for (const window of active) {
    if (
      !firesAt(
        {
          startTime: window.startTime,
          endTime: window.endTime,
          interval: window.interval as CaptureInterval,
          days: window.days,
        },
        now,
      )
    ) {
      continue
    }

    try {
      const result = await captureService.enqueueCapture(window.userId, window.zoneId, {
        trigger: 'scheduled',
        scheduleId: window.id,
      })
      if (result.queued) fired++
      else skipped++
    } catch (err) {
      // One zone failing must not stop the rest of this minute's windows. The capture
      // row records the failure; this line is for the operator watching logs.
      console.error(
        `[scheduler] window ${window.id} (zone ${window.zoneId}) failed:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  if (fired > 0 || skipped > 0) {
    console.log(`[scheduler] ${key} — ${fired} queued, ${skipped} refused by plan limit`)
  }
  return { fired, skipped }
}

/** Milliseconds until the top of the next minute. */
function untilNextMinute(now: Date): number {
  return MINUTE - (now.getTime() % MINUTE)
}

export function startScheduler(): void {
  if (timer) return

  const run = () => {
    void tick().catch((err) => console.error('[scheduler] tick failed:', err))
    // Re-aligned every pass rather than a fixed interval, so firings stay on the minute
    // instead of drifting a second later each hour.
    timer = setTimeout(run, untilNextMinute(new Date()))
  }

  console.log('[scheduler] started — capture windows fire on the minute, Asia/Jakarta')
  timer = setTimeout(run, untilNextMinute(new Date()))
}

export function stopScheduler(): void {
  if (timer) clearTimeout(timer)
  timer = null
}
