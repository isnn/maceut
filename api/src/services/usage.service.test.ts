import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/zone.repository', () => ({ findByUserId: vi.fn() }))
vi.mock('../repositories/schedule.repository', () => ({ findByUserId: vi.fn() }))
vi.mock('../repositories/user.repository', () => ({ findByIdWithPlan: vi.fn() }))

import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import * as userRepo from '../repositories/user.repository'
import { getUsage, getCollectionHealth } from './usage.service'

const USER = 'user_01'

function schedule(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    userId: USER,
    zoneId: 'z1',
    label: 'Jam sibuk pagi',
    startTime: '07:00',
    endTime: '09:00',
    interval: 'hourly',
    days: [0, 1, 2, 3, 4], // Mon–Fri
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as never
}

function zone(over: Record<string, unknown> = {}) {
  return { id: 'z1', userId: USER, name: 'Zona', status: 'collecting', roadsCount: null, ...over } as never
}

/** Freezes the clock at a given WIB moment, expressed as the equivalent UTC. */
function atWib(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan: 'premium' } as never)
  vi.mocked(zoneRepo.findByUserId).mockResolvedValue([])
  vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('getUsage', () => {
  it('reports null rather than a guess for anything not yet measured', async () => {
    const usage = await getUsage(USER)

    // The old dashboard reported rendersThisMonth: 7 and storage as zones * 1.37.
    // A plausible invented number is worse than a dash: nobody re-checks it.
    expect(usage.capturesToday).toBeNull()
    expect(usage.rendersThisMonth).toBeNull()
    expect(usage.storageUsedGb).toBeNull()
  })

  it('counts only collecting zones and active windows', async () => {
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([
      zone({ id: 'a' }),
      zone({ id: 'b', status: 'paused' }),
    ])
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([
      schedule({ id: 'x' }),
      schedule({ id: 'y', status: 'paused' }),
    ])

    const usage = await getUsage(USER)

    expect(usage.zonesCount).toBe(1)
    expect(usage.schedulesActiveCount).toBe(1)
  })

  it('surfaces what the plan paused, so a downgrade is explainable', async () => {
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone({ status: 'paused' }), zone({ id: 'b', status: 'paused' })])
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ status: 'paused' })])

    const usage = await getUsage(USER)

    // Without this the account just sees collection stop, with nothing anywhere
    // explaining why (ADR-020).
    expect(usage.pausedByPlan).toEqual({ zones: 2, schedules: 1 })
  })

  it('reports frames for the busiest day, not the weekly total', async () => {
    // Two windows of 2 frames each, on different days: the busiest day is still 2.
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([
      schedule({ id: 'mon', days: [0] }),
      schedule({ id: 'tue', days: [1] }),
    ])

    const usage = await getUsage(USER)

    expect(usage.framesPerDay).toBe(2)
  })

  it('adds up windows that share a day', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([
      schedule({ id: 'a', days: [0] }),
      schedule({ id: 'b', days: [0] }),
    ])

    expect((await getUsage(USER)).framesPerDay).toBe(4)
  })
})

describe('getCollectionHealth — next capture', () => {
  it('finds the next fire time later today', async () => {
    // Tuesday 06:30 WIB = Monday 23:30 UTC.
    atWib('2026-09-21T23:30:00Z')
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])

    const health = await getCollectionHealth(USER)

    expect(health.nextCaptureAt).toBe('07:00')
    expect(health.nextCaptureNote).toContain('hari ini')
  })

  it('rolls to the next hour once the first has passed', async () => {
    // Tuesday 07:30 WIB = Tuesday 00:30 UTC. 07:00 has gone; 08:00 is next.
    atWib('2026-09-22T00:30:00Z')
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])

    expect((await getCollectionHealth(USER)).nextCaptureAt).toBe('08:00')
  })

  it('rolls to tomorrow when the window has finished for the day', async () => {
    // Tuesday 18:00 WIB = Tuesday 11:00 UTC — the window is done for today.
    atWib('2026-09-22T11:00:00Z')
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])

    const health = await getCollectionHealth(USER)

    expect(health.nextCaptureAt).toBe('07:00')
    expect(health.nextCaptureNote).toContain('besok')
  })

  it('skips days the window does not run', async () => {
    // Saturday 10:00 WIB (2026-09-19 is a Saturday). A Mon–Fri window next fires on
    // Monday, two days out.
    atWib('2026-09-19T03:00:00Z')
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])

    const health = await getCollectionHealth(USER)

    expect(health.nextCaptureAt).toBe('07:00')
    expect(health.nextCaptureNote).toContain('2 hari lagi')
  })

  it('uses WIB, not UTC, to decide what day it is', async () => {
    // Sunday 23:00 UTC is already Monday 06:00 in Jakarta. Reading this in UTC would
    // say Sunday — a non-running day — and push the next capture out by a full day.
    atWib('2026-09-20T23:00:00Z')
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])

    const health = await getCollectionHealth(USER)

    expect(health.nextCaptureNote).toContain('hari ini')
  })

  it('fires once at the start for a daily window', async () => {
    atWib('2026-09-21T23:30:00Z') // Tuesday 06:30 WIB
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ interval: 'daily' })])

    expect((await getCollectionHealth(USER)).nextCaptureAt).toBe('07:00')
  })

  it('has nothing to report when no window is active', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ status: 'paused' })])

    const health = await getCollectionHealth(USER)

    expect(health.nextCaptureAt).toBeNull()
    expect(health.nextCaptureNote).toMatch(/Belum ada jendela aktif/)
  })
})

describe('getCollectionHealth — status', () => {
  it('is idle, not degraded, when nothing is scheduled', async () => {
    // An account that has not scheduled anything is working as configured. Calling
    // that "degraded" would cry wolf.
    expect((await getCollectionHealth(USER)).status).toBe('idle')
  })

  it('is degraded when the plan has paused something', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone(), zone({ id: 'b', status: 'paused' })])

    expect((await getCollectionHealth(USER)).status).toBe('degraded')
  })

  it('is healthy when everything is running', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone()])

    expect((await getCollectionHealth(USER)).status).toBe('healthy')
  })

  it('reports roads as unknown rather than zero while HERE is silent', async () => {
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone({ roadsCount: null })])

    // Zero would claim the zone matched no roads — a different statement.
    expect((await getCollectionHealth(USER)).roadsReporting).toBeNull()
  })

  it('sums road counts once HERE has answered', async () => {
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([
      zone({ id: 'a', roadsCount: 12 }),
      zone({ id: 'b', roadsCount: 30 }),
    ])

    expect((await getCollectionHealth(USER)).roadsReporting).toBe(42)
  })
})
