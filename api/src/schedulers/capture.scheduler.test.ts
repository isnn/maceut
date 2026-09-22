import { describe, it, expect } from 'vitest'
import { firesAt, wibMinutes, wibWeekday, type FirableWindow } from './capture.scheduler'

/**
 * These pin the one thing that must never drift: when a window fires.
 *
 * The frame budget the plan limit is checked against is derived from the same rule
 * (`framesPerDay`), so a disagreement here means the limit guards a number of captures
 * that is not the number actually taken.
 */

function window(over: Partial<FirableWindow> = {}): FirableWindow {
  return { startTime: '07:00', endTime: '09:00', interval: 'hourly', days: [0, 1, 2, 3, 4], ...over }
}

/** A UTC instant, given the WIB wall-clock time we want it to represent. */
function wib(dateUtc: string): Date {
  return new Date(dateUtc)
}

describe('WIB clock', () => {
  it('reads minutes in Jakarta, not UTC', () => {
    // 00:00 UTC is 07:00 in Jakarta.
    expect(wibMinutes(wib('2026-09-21T00:00:00Z'))).toBe(7 * 60)
  })

  it('wraps past midnight', () => {
    // 17:00 UTC is 00:00 the next day in Jakarta.
    expect(wibMinutes(wib('2026-09-21T17:00:00Z'))).toBe(0)
  })

  it('uses the Jakarta date to decide the weekday', () => {
    // Sunday 23:00 UTC is already Monday 06:00 in Jakarta. Reading this in UTC would
    // call it Sunday and skip every Mon–Fri window.
    expect(wibWeekday(wib('2026-09-20T23:00:00Z'))).toBe(0)
  })
})

describe('firesAt', () => {
  it('fires at the start of the window', () => {
    expect(firesAt(window(), wib('2026-09-22T00:00:00Z'))).toBe(true) // Tue 07:00 WIB
  })

  it('fires each hour inside the window', () => {
    expect(firesAt(window(), wib('2026-09-22T01:00:00Z'))).toBe(true) // 08:00 WIB
  })

  it('does NOT fire at the end — the end is exclusive', () => {
    // Otherwise "07:00 to 09:00" quietly means three captures, and the frame budget
    // the plan limit was checked against is wrong.
    expect(firesAt(window(), wib('2026-09-22T02:00:00Z'))).toBe(false) // 09:00 WIB
  })

  it('does not fire between steps', () => {
    expect(firesAt(window(), wib('2026-09-22T00:30:00Z'))).toBe(false) // 07:30 WIB
  })

  it('does not fire before the window opens', () => {
    expect(firesAt(window(), wib('2026-09-21T23:00:00Z'))).toBe(false) // 06:00 WIB
  })

  it('fires every 15 minutes on a 15min window', () => {
    const w = window({ interval: '15min' })
    expect(firesAt(w, wib('2026-09-22T00:15:00Z'))).toBe(true) // 07:15
    expect(firesAt(w, wib('2026-09-22T00:30:00Z'))).toBe(true) // 07:30
    expect(firesAt(w, wib('2026-09-22T00:20:00Z'))).toBe(false)
  })

  it('steps from the window start, not from the top of the hour', () => {
    // A 07:27 window at 15-minute intervals fires at :27, :42, :57 — not at :30.
    const w = window({ startTime: '07:27', endTime: '08:27', interval: '15min' })
    expect(firesAt(w, wib('2026-09-22T00:27:00Z'))).toBe(true)
    expect(firesAt(w, wib('2026-09-22T00:42:00Z'))).toBe(true)
    expect(firesAt(w, wib('2026-09-22T00:30:00Z'))).toBe(false)
  })

  it('fires once at the start on a daily window', () => {
    const w = window({ interval: 'daily' })
    expect(firesAt(w, wib('2026-09-22T00:00:00Z'))).toBe(true) // 07:00
    expect(firesAt(w, wib('2026-09-22T01:00:00Z'))).toBe(false) // 08:00
  })

  it('skips days the window does not run', () => {
    // 2026-09-19 is a Saturday; the default window is Mon–Fri.
    expect(firesAt(window(), wib('2026-09-19T00:00:00Z'))).toBe(false)
  })

  it('honours the Jakarta weekday at a UTC day boundary', () => {
    // Sunday 23:00 UTC = Monday 06:00 WIB, and a 06:00 Monday window must fire.
    const w = window({ startTime: '06:00', endTime: '07:00', days: [0] })
    expect(firesAt(w, wib('2026-09-20T23:00:00Z'))).toBe(true)
  })

  it('never fires on a window whose times are malformed', () => {
    expect(firesAt(window({ startTime: 'oops' }), wib('2026-09-22T00:00:00Z'))).toBe(false)
  })

  it('never fires when the window has no days', () => {
    expect(firesAt(window({ days: [] }), wib('2026-09-22T00:00:00Z'))).toBe(false)
  })
})
