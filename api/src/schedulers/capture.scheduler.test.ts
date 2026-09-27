import { describe, it, expect } from 'vitest'
import {
  firesAt,
  nextFireAfter,
  countFiringsBetween,
  wibMinutes,
  wibWeekday,
  type FirableWindow,
} from './capture.scheduler'

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

describe('nextFireAfter', () => {
  it('agrees with firesAt by construction', () => {
    // It is derived by asking firesAt, not by a second formula — so whatever it returns
    // must be a minute firesAt accepts. A second derivation is how framesPerDay drifted.
    const w = window({ startTime: '07:27', endTime: '09:27', interval: '15min' })
    let cursor = wib('2026-09-21T23:00:00Z')
    for (let i = 0; i < 12; i++) {
      const next = nextFireAfter(w, cursor)
      expect(next).not.toBeNull()
      expect(firesAt(w, next!)).toBe(true)
      cursor = next!
    }
  })

  it('finds the first firing of the window', () => {
    expect(nextFireAfter(window(), wib('2026-09-21T23:00:00Z'))?.toISOString()).toBe('2026-09-22T00:00:00.000Z')
  })

  it('moves to the next step inside the window', () => {
    expect(nextFireAfter(window(), wib('2026-09-22T00:00:00Z'))?.toISOString()).toBe('2026-09-22T01:00:00.000Z')
  })

  it('rolls to the next running day once the window closes', () => {
    // 09:00 WIB Tuesday — done for the day, so tomorrow's 07:00.
    expect(nextFireAfter(window(), wib('2026-09-22T02:00:00Z'))?.toISOString()).toBe('2026-09-23T00:00:00.000Z')
  })

  it('skips a whole weekend', () => {
    // Friday 18:00 WIB on a Mon–Fri window → Monday 07:00 WIB.
    expect(nextFireAfter(window(), wib('2026-09-18T11:00:00Z'))?.toISOString()).toBe('2026-09-21T00:00:00.000Z')
  })

  it('returns null when the window runs on no day', () => {
    expect(nextFireAfter(window({ days: [] }), wib('2026-09-22T00:00:00Z'))).toBeNull()
  })
})

describe('countFiringsBetween', () => {
  it('counts what an outage swallowed', () => {
    // 07:00–09:00 hourly, down from 07:00 to 12:00 WIB → 07:00 and 08:00 missed.
    expect(countFiringsBetween(window(), wib('2026-09-22T00:00:00Z'), wib('2026-09-22T05:00:00Z'))).toBe(2)
  })

  it('counts a 15-minute window’s firings across the same gap', () => {
    const w = window({ interval: '15min' })
    expect(countFiringsBetween(w, wib('2026-09-22T00:00:00Z'), wib('2026-09-22T05:00:00Z'))).toBe(8)
  })

  it('is zero when the outage missed nothing', () => {
    // 10:00–11:00 WIB sits outside a 07:00–09:00 window.
    expect(countFiringsBetween(window(), wib('2026-09-22T03:00:00Z'), wib('2026-09-22T04:00:00Z'))).toBe(0)
  })

  it('is capped, so a year-long gap cannot spin', () => {
    expect(countFiringsBetween(window({ interval: '15min' }), wib('2026-01-01T00:00:00Z'), wib('2026-12-31T00:00:00Z'), 50)).toBe(50)
  })
})
