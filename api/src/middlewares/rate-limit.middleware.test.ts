import { describe, it, expect, beforeEach } from 'vitest'
import { resetRateLimits, take } from './rate-limit.middleware'

const limits = { per10Min: 30, perDay: 200 }
const T0 = Date.parse('2026-10-13T03:00:00Z')

beforeEach(() => resetRateLimits())

describe('take', () => {
  it('allows 30 in ten minutes, refuses the 31st with the seconds to wait', () => {
    for (let i = 0; i < 30; i++) expect(take('u1', limits, T0 + i * 1000)).toBe(0)
    // The first call leaves the window at T0 + 600 s; asked at T0 + 30 s, that is 570 s away.
    expect(take('u1', limits, T0 + 30_000)).toBe(570)
  })

  it('opens again once the oldest call leaves the window', () => {
    for (let i = 0; i < 30; i++) take('u1', limits, T0)
    expect(take('u1', limits, T0 + 10 * 60 * 1000)).toBe(0)
  })

  it('counts each account on its own', () => {
    for (let i = 0; i < 30; i++) take('u1', limits, T0)
    expect(take('u2', limits, T0)).toBe(0)
  })

  it('stops at the daily limit even when spread out', () => {
    for (let i = 0; i < 200; i++) expect(take('u1', limits, T0 + i * 4 * 60 * 1000 /* 4 min apart */)).toBe(0)
    const wait = take('u1', limits, T0 + 200 * 4 * 60 * 1000)
    expect(wait).toBeGreaterThan(0)
  })
})
