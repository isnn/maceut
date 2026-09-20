import { describe, it, expect } from 'vitest'
import { framesPerDay, parseTime, toCron, INTERVAL_PER_HOUR } from './schedule'

describe('parseTime', () => {
  it('accepts 24-hour HH:mm', () => {
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('07:30')).toBe(450)
    expect(parseTime('23:59')).toBe(1439)
  })

  it('rejects anything else rather than coercing it', () => {
    for (const bad of ['24:00', '7:00', '07:60', '0700', 'noon', '']) {
      expect(parseTime(bad), bad).toBeNull()
    }
  })
})

describe('framesPerDay', () => {
  it('matches the frontend formula the board budgets against', () => {
    // web/src/features/schedules/types.ts computes the same number. If the two
    // disagree, the UI promises a budget the server does not enforce.
    expect(framesPerDay({ start: '07:00', end: '09:00', interval: 'hourly', days: [0] })).toBe(2)
    expect(framesPerDay({ start: '07:00', end: '09:00', interval: '15min', days: [0] })).toBe(8)
  })

  it('treats daily as one frame regardless of the window', () => {
    expect(framesPerDay({ start: '07:00', end: '19:00', interval: 'daily', days: [0] })).toBe(1)
  })

  it('is zero for a window with no hours in it', () => {
    expect(framesPerDay({ start: '07:00', end: '07:00', interval: 'hourly', days: [0] })).toBe(0)
  })

  it('exposes the per-hour rates the UI shares', () => {
    expect(INTERVAL_PER_HOUR).toEqual({ '15min': 4, hourly: 1, daily: 0 })
  })
})

describe('toCron', () => {
  it('remaps the UI weekday numbering onto cron', () => {
    // The UI uses 0 = Monday; cron uses 0 = Sunday. Getting this wrong shifts every
    // schedule by a day — a bug that only shows up in production, on a Monday.
    expect(toCron({ start: '07:00', end: '09:00', interval: 'hourly', days: [0] })).toBe('0 7-8 * * 1')
    expect(toCron({ start: '07:00', end: '09:00', interval: 'hourly', days: [6] })).toBe('0 7-8 * * 0')
  })

  it('collapses a full week to *', () => {
    const cron = toCron({ start: '07:00', end: '08:00', interval: 'hourly', days: [0, 1, 2, 3, 4, 5, 6] })
    expect(cron).toBe('0 7 * * *')
  })

  it('lists weekdays in cron order', () => {
    // Mon–Fri in UI numbering is 0..4, which is 1..5 in cron.
    expect(toCron({ start: '07:00', end: '09:00', interval: 'hourly', days: [0, 1, 2, 3, 4] })).toBe('0 7-8 * * 1,2,3,4,5')
  })

  it('treats the window as half-open so no frame falls outside it', () => {
    // 07:00–09:00 hourly fires at 07 and 08, not 09 — firing at the end hour would
    // produce a frame outside the window the user drew.
    expect(toCron({ start: '07:00', end: '09:00', interval: 'hourly', days: [0] })).toContain('7-8')
  })

  it('fires four times an hour for 15min', () => {
    expect(toCron({ start: '07:00', end: '09:00', interval: '15min', days: [0] })).toBe('0,15,30,45 7-8 * * 1')
  })

  it('fires once at the start time for daily', () => {
    expect(toCron({ start: '07:30', end: '19:00', interval: 'daily', days: [0, 4] })).toBe('30 7 * * 1,5')
  })

  it('handles a one-hour window without emitting an empty range', () => {
    expect(toCron({ start: '07:00', end: '08:00', interval: 'hourly', days: [0] })).toBe('0 7 * * 1')
  })
})
