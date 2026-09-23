import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/zone.repository', () => ({ findByUserId: vi.fn() }))
vi.mock('../repositories/schedule.repository', () => ({
  findByUserId: vi.fn(),
  earliestDueForUser: vi.fn(async () => null),
}))
vi.mock('../repositories/user.repository', () => ({ findByIdWithPlan: vi.fn() }))
vi.mock('../repositories/capture.repository', () => ({ countForWibDay: vi.fn(async () => 0) }))

import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import * as userRepo from '../repositories/user.repository'
import * as captureRepo from '../repositories/capture.repository'
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
  vi.mocked(captureRepo.countForWibDay).mockResolvedValue(0)
  vi.mocked(scheduleRepo.earliestDueForUser).mockResolvedValue(null)
})
afterEach(() => vi.useRealTimers())

describe('getUsage', () => {
  it('reports null rather than a guess for anything still unmeasured', async () => {
    const usage = await getUsage(USER)

    // The old dashboard reported rendersThisMonth: 7 and storage as zones * 1.37.
    // A plausible invented number is worse than a dash: nobody re-checks it. These two
    // stay null until images are rendered into R2.
    expect(usage.rendersThisMonth).toBeNull()
    expect(usage.storageUsedGb).toBeNull()
  })

  it('counts today’s captures for real now that the table exists', async () => {
    vi.mocked(captureRepo.countForWibDay).mockResolvedValue(7)

    expect((await getUsage(USER)).capturesToday).toBe(7)
  })

  it('counts them against the WIB day, not the server’s', async () => {
    await getUsage(USER)

    // BR-006's day boundary is Jakarta's. Counting in UTC would roll the quota over at
    // 07:00 WIB, seven hours into someone's working day.
    expect(captureRepo.countForWibDay).toHaveBeenCalledWith(USER, expect.any(Date))
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
  /**
   * These used to re-derive the next firing from the window. They now assert that the
   * dashboard reads `schedules.next_fire_at` instead — the column the scheduler
   * actually claims by.
   *
   * That distinction is the point: a separately derived figure is a prediction of what
   * the system SHOULD do, and this is what it WILL do. They agreed while both came from
   * the same rule, but only one of them fires, and a dashboard that disagrees with the
   * scheduler is worse than no dashboard. When they can only agree, they cannot drift.
   * The firing rule itself is pinned in capture.scheduler.test.ts.
   */

  it('shows the time the scheduler will actually fire', async () => {
    atWib('2026-09-21T23:30:00Z') // Tue 06:30 WIB
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])
    vi.mocked(scheduleRepo.earliestDueForUser).mockResolvedValue(new Date('2026-09-22T00:00:00Z'))

    const health = await getCollectionHealth(USER)

    expect(health.nextCaptureAt).toBe('07:00')
    expect(health.nextCaptureInDays).toBe(0)
  })

  it('says tomorrow when the next firing is the next day in Jakarta', async () => {
    atWib('2026-09-22T11:00:00Z') // Tue 18:00 WIB
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])
    vi.mocked(scheduleRepo.earliestDueForUser).mockResolvedValue(new Date('2026-09-23T00:00:00Z'))

    expect((await getCollectionHealth(USER)).nextCaptureInDays).toBe(1)
  })

  it('counts the days ahead on Jakarta’s calendar', async () => {
    atWib('2026-09-19T03:00:00Z') // Sat 10:00 WIB
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])
    vi.mocked(scheduleRepo.earliestDueForUser).mockResolvedValue(new Date('2026-09-21T00:00:00Z'))

    expect((await getCollectionHealth(USER)).nextCaptureInDays).toBe(2)
  })

  it('reads the clock in WIB, not UTC', async () => {
    // Sunday 23:00 UTC is already Monday 06:00 in Jakarta, and the firing an hour later
    // is the same Jakarta day — "today", not "tomorrow".
    atWib('2026-09-20T23:00:00Z')
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])
    vi.mocked(scheduleRepo.earliestDueForUser).mockResolvedValue(new Date('2026-09-21T00:00:00Z'))

    expect((await getCollectionHealth(USER)).nextCaptureInDays).toBe(0)
  })

  it('renders the firing time in WIB', async () => {
    atWib('2026-09-22T00:00:00Z')
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])
    // 09:30 UTC is 16:30 in Jakarta.
    vi.mocked(scheduleRepo.earliestDueForUser).mockResolvedValue(new Date('2026-09-22T09:30:00Z'))

    expect((await getCollectionHealth(USER)).nextCaptureAt).toBe('16:30')
  })

  it('has nothing to report when no window is active', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ status: 'paused' })])
    vi.mocked(scheduleRepo.earliestDueForUser).mockResolvedValue(null)

    const health = await getCollectionHealth(USER)

    expect(health.nextCaptureAt).toBeNull()
    expect(health.nextCaptureInDays).toBeNull()
  })

  it('reports no day when a window is active but its firing is not computed yet', async () => {
    // A window seeded seconds ago, before the scheduler's first pass. The UI tells those
    // two cases apart by `zonesCollecting`; the API stopped phrasing either of them.
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule()])
    vi.mocked(scheduleRepo.earliestDueForUser).mockResolvedValue(null)

    expect((await getCollectionHealth(USER)).nextCaptureInDays).toBeNull()
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
