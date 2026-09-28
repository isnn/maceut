import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/here-usage.repository', () => ({
  getSetting: vi.fn(),
  increment: vi.fn(async () => undefined),
  totalsOn: vi.fn(),
  totalsSince: vi.fn(),
}))
vi.mock('../lib/here-traffic-client', () => ({ getTrafficFlow: vi.fn() }))

import * as usageRepo from '../repositories/here-usage.repository'
import * as here from '../lib/here-traffic-client'
import {
  assertWithinBudget,
  forgetBudget,
  getBudget,
  limitReached,
  meteredTrafficFlow,
  wibDay,
  wibMonthStart,
} from './here-usage.service'
import { TrafficUnavailableError } from '../errors'

const zero = { requests: 0, failed: 0, refused: 0 }
const BBOX: [number, number, number, number] = [110.36, -7.8, 110.37, -7.79]

function budget(value: Record<string, unknown> | undefined) {
  vi.mocked(usageRepo.getSetting).mockResolvedValue(value ? ({ value, updatedAt: new Date(), updatedBy: null } as never) : undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  forgetBudget()
  vi.mocked(usageRepo.totalsOn).mockResolvedValue(zero)
  vi.mocked(usageRepo.totalsSince).mockResolvedValue(zero)
  vi.mocked(here.getTrafficFlow).mockResolvedValue({ type: 'FeatureCollection', features: [] })
})

describe('WIB day and month', () => {
  it('counts a call after 17:00 UTC against the next WIB day', () => {
    expect(wibDay(new Date('2026-09-30T17:30:00Z'))).toBe('2026-10-01')
    expect(wibMonthStart(new Date('2026-09-30T17:30:00Z'))).toBe('2026-10-01')
    expect(wibMonthStart(new Date('2026-09-30T16:59:00Z'))).toBe('2026-09-01')
  })
})

describe('getBudget', () => {
  it('means "no cap" when nothing has been set', async () => {
    budget(undefined)
    expect(await getBudget()).toEqual({ dailyLimit: null, monthlyLimit: null, costPer1000: null })
  })

  it('is cached briefly — the setting is read once for a burst of calls', async () => {
    budget({ dailyLimit: 100 })
    await getBudget(1_000)
    await getBudget(5_000)
    expect(usageRepo.getSetting).toHaveBeenCalledTimes(1)
    await getBudget(20_000)
    expect(usageRepo.getSetting).toHaveBeenCalledTimes(2)
  })
})

describe('limitReached', () => {
  const b = { dailyLimit: 100, monthlyLimit: 1000, costPer1000: null }
  it('flags the daily cap first, then the monthly one', () => {
    expect(limitReached(b, { ...zero, requests: 100 }, { ...zero, requests: 100 })).toBe('daily')
    expect(limitReached(b, { ...zero, requests: 5 }, { ...zero, requests: 1000 })).toBe('monthly')
    expect(limitReached(b, { ...zero, requests: 99 }, { ...zero, requests: 999 })).toBeNull()
  })
})

describe('assertWithinBudget', () => {
  it('reads no totals at all when there is no cap', async () => {
    budget(undefined)
    await assertWithinBudget('capture')
    expect(usageRepo.totalsOn).not.toHaveBeenCalled()
  })

  it('refuses at the daily cap, records the refusal, and says nothing about HERE', async () => {
    budget({ dailyLimit: 10 })
    vi.mocked(usageRepo.totalsOn).mockResolvedValue({ ...zero, requests: 10 })

    const err = await assertWithinBudget('preview').catch((e) => e)

    expect(err).toBeInstanceOf(TrafficUnavailableError)
    expect(err.message).not.toMatch(/here|budget|limit/i)
    expect(usageRepo.increment).toHaveBeenCalledWith(expect.any(String), 'preview', { refused: 1 })
  })

  it('refuses at the monthly cap', async () => {
    budget({ monthlyLimit: 500 })
    vi.mocked(usageRepo.totalsSince).mockResolvedValue({ ...zero, requests: 500 })
    await expect(assertWithinBudget('capture')).rejects.toBeInstanceOf(TrafficUnavailableError)
  })
})

describe('meteredTrafficFlow', () => {
  it('counts a successful call against its source', async () => {
    budget(undefined)
    await meteredTrafficFlow('capture', BBOX)
    expect(usageRepo.increment).toHaveBeenCalledWith(expect.any(String), 'capture', { requests: 1 })
  })

  it('counts a failed call as sent AND failed, and rethrows', async () => {
    budget(undefined)
    vi.mocked(here.getTrafficFlow).mockRejectedValue(new Error('HTTP 429'))

    await expect(meteredTrafficFlow('road_counts', BBOX)).rejects.toThrow('HTTP 429')
    expect(usageRepo.increment).toHaveBeenCalledWith(expect.any(String), 'road_counts', { requests: 1, failed: 1 })
  })

  it('never contacts HERE once the cap is reached', async () => {
    budget({ dailyLimit: 1 })
    vi.mocked(usageRepo.totalsOn).mockResolvedValue({ ...zero, requests: 1 })

    await expect(meteredTrafficFlow('capture', BBOX)).rejects.toBeInstanceOf(TrafficUnavailableError)
    expect(here.getTrafficFlow).not.toHaveBeenCalled()
  })
})
