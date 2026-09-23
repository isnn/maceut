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

/**
 * The next minute this window fires, strictly after `after`.
 *
 * Derived by walking forward and asking `firesAt` — not by a second formula. That is
 * deliberate: a separate derivation is a second definition of the same rule, and this
 * codebase has already had two such definitions drift (`framesPerDay` floored windows
 * to whole hours and disagreed with firing for months). Built this way they cannot
 * disagree, because there is only one rule.
 *
 * Cost is bounded and trivial: whole non-matching days are skipped, so the worst case
 * is 7 day-checks plus one day of minutes. It runs once per firing, not per tick.
 *
 * Returns null when the window fires on no day at all.
 */
export function nextFireAfter(window: FirableWindow, after: Date): Date | null {
  // Start at the top of the next minute — `after` is the moment we just fired.
  const cursor = new Date(Math.floor(after.getTime() / MINUTE) * MINUTE + MINUTE)

  for (let day = 0; day <= 7; day++) {
    if (!window.days.includes(wibWeekday(cursor))) {
      // Jump to 00:00 WIB of the next day rather than testing 1,440 dead minutes.
      const minutesLeft = 24 * 60 - wibMinutes(cursor)
      cursor.setTime(cursor.getTime() + minutesLeft * MINUTE)
      continue
    }

    const endOfDay = 24 * 60 - wibMinutes(cursor)
    for (let i = 0; i < endOfDay; i++) {
      if (firesAt(window, cursor)) return new Date(cursor)
      cursor.setTime(cursor.getTime() + MINUTE)
    }
  }
  return null
}

/**
 * How many times a window would have fired in a span it was down for.
 *
 * Used on recovery to say "12 firings missed between 07:00 and 12:00" rather than
 * either firing them all — which would flood the queue with frames whose moment has
 * passed and burn the account's daily limit — or saying nothing at all.
 */
export function countFiringsBetween(window: FirableWindow, from: Date, to: Date, cap = 500): number {
  let count = 0
  let cursor: Date | null = new Date(from.getTime() - MINUTE)
  while (count < cap) {
    cursor = nextFireAfter(window, cursor)
    if (!cursor || cursor > to) break
    count++
  }
  return count
}

let timer: NodeJS.Timeout | null = null
let running = false

/** How late a firing may be and still be worth taking. */
const GRACE_MS = 5 * 60_000

/** Never sleep longer than this, so a window created moments ago is picked up. */
const MAX_SLEEP_MS = 60_000

function windowOf(row: scheduleRepo.ScheduleRecord): FirableWindow {
  return {
    startTime: row.startTime,
    endTime: row.endTime,
    interval: row.interval as CaptureInterval,
    days: row.days,
  }
}

/**
 * Gives a next firing to windows that have none — new ones, and everything that existed
 * before `next_fire_at` did.
 *
 * Seeding never fires. A window migrated in at noon with a 07:00 slot must not fire at
 * noon just because its column was empty; it gets tomorrow's 07:00 and waits. Deploying
 * this must be uneventful.
 */
export async function seedUnseeded(now: Date = new Date()): Promise<number> {
  const rows = await scheduleRepo.findUnseeded()
  for (const row of rows) {
    await scheduleRepo.setNextFireAt(row.id, nextFireAfter(windowOf(row), now))
  }
  if (rows.length > 0) console.log(`[scheduler] seeded ${rows.length} window(s) with a next firing`)
  return rows.length
}

export interface TickResult {
  fired: number
  refused: number
  missed: number
}

/**
 * One pass: claim what is due, fire what is still worth firing, record what is not.
 *
 * A firing more than the grace period late is NOT taken. The value of a 07:00 frame is
 * that it is from 07:00 — one collected at 11:40 after an outage is a different and
 * misleading answer, and it would also spend the account's daily quota on a frame it
 * never asked for. Those become `missed` rows instead: not a failure, because nothing
 * was attempted, and not a refusal, because the plan did not object. A gap you can see
 * beats a gap you cannot.
 */
export async function tick(now: Date = new Date()): Promise<TickResult> {
  const due = await scheduleRepo.claimDue(now)
  const result: TickResult = { fired: 0, refused: 0, missed: 0 }

  for (const row of due) {
    const window = windowOf(row)

    // Move the window on before anything else can fail. A window whose next firing is
    // never written would look unseeded forever.
    const next = nextFireAfter(window, now)
    await scheduleRepo.setNextFireAt(row.id, next)

    const lateBy = now.getTime() - row.dueAt.getTime()

    try {
      if (lateBy > GRACE_MS) {
        // How many firings the outage swallowed, recorded as one row rather than
        // hundreds — enough to diagnose, bounded enough to read.
        const skipped = countFiringsBetween(window, row.dueAt, now)
        await captureService.recordMissed(row.userId, row.zoneId, {
          scheduleId: row.id,
          scheduledFor: row.dueAt,
          occurrences: skipped,
          lateBySeconds: Math.round(lateBy / 1000),
        })
        result.missed++
        continue
      }

      const outcome = await captureService.enqueueCapture(row.userId, row.zoneId, {
        trigger: 'scheduled',
        scheduleId: row.id,
        scheduledFor: row.dueAt,
      })
      if (outcome.queued) result.fired++
      else result.refused++
    } catch (err) {
      // One account's problem must not stop everyone else's windows this minute.
      console.error(
        `[scheduler] window ${row.id} (zone ${row.zoneId}) failed:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  if (result.fired || result.refused || result.missed) {
    console.log(
      `[scheduler] ${now.toISOString().slice(0, 16)} — ${result.fired} queued, ` +
        `${result.refused} refused by plan, ${result.missed} missed`,
    )
  }
  return result
}

/**
 * Milliseconds to wait before looking again.
 *
 * Sleeps until the soonest window is actually due rather than waking every minute to
 * usually find nothing — which is only possible because the next firing is a column
 * instead of something held in memory. Capped so a window created seconds ago does not
 * wait behind one scheduled for next Tuesday.
 */
async function sleepFor(now: Date): Promise<number> {
  const earliest = await scheduleRepo.earliestDue()
  if (!earliest) return MAX_SLEEP_MS
  return Math.max(250, Math.min(earliest.getTime() - now.getTime(), MAX_SLEEP_MS))
}

export function startScheduler(): void {
  if (timer) return

  const run = async () => {
    if (running) return
    running = true
    try {
      await seedUnseeded()
      await tick()
    } catch (err) {
      console.error('[scheduler] pass failed:', err instanceof Error ? err.message : err)
    } finally {
      running = false
    }

    const delay = await sleepFor(new Date()).catch(() => MAX_SLEEP_MS)
    timer = setTimeout(() => void run(), delay)
  }

  console.log('[scheduler] started — firing times live in Postgres, Asia/Jakarta')
  timer = setTimeout(() => void run(), 250)
}

export function stopScheduler(): void {
  if (timer) clearTimeout(timer)
  timer = null
}
