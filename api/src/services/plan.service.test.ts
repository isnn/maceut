import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/zone.repository', () => ({ findByUserId: vi.fn(), update: vi.fn(), deleteById: vi.fn() }))
vi.mock('../repositories/schedule.repository', () => ({ findByUserId: vi.fn(), update: vi.fn(), softDelete: vi.fn() }))

import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import { previewPlanChange, applyPlanChange } from './plan.service'

const USER = 'user_01'
const DAY = 86_400_000

/** Older rows get an earlier createdAt, so "newest first" is testable. */
function schedule(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    userId: USER,
    zoneId: 'z1',
    label: 'Window',
    startTime: '07:00',
    endTime: '09:00',
    interval: 'hourly',
    days: [0, 1, 2, 3, 4],
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as never
}

function zone(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'z1',
    userId: USER,
    name: 'Zona',
    status: 'collecting',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([])
  vi.mocked(zoneRepo.findByUserId).mockResolvedValue([])
})

describe('nothing is ever deleted', () => {
  it('only ever pauses — applyPlanChange issues no deletes', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ interval: '15min' })])
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone(), zone({ id: 'z2' })])

    await applyPlanChange(USER, 'free')

    expect(scheduleRepo.update).toHaveBeenCalledWith('s1', { status: 'paused' })
    expect(zoneRepo.update).toHaveBeenCalledWith(expect.any(String), { status: 'paused' })
    // The whole point of grandfathering: a downgrade must never destroy the only
    // record of something the customer was collecting.
    expect(zoneRepo.deleteById).not.toHaveBeenCalled()
    expect(scheduleRepo.softDelete).not.toHaveBeenCalled()
  })
})

describe('interval above the plan', () => {
  it('pauses an hourly window on free, whatever the count', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ interval: 'hourly' })])

    const impact = await previewPlanChange(USER, 'free')

    expect(impact.schedulesToPause).toHaveLength(1)
    expect(impact.schedulesToPause[0]!.reason).toBe('interval_above_plan')
  })

  it('pauses 15min on standard but leaves hourly alone', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([
      schedule({ id: 'fifteen', interval: '15min' }),
      schedule({ id: 'hourly', interval: 'hourly' }),
    ])

    const impact = await previewPlanChange(USER, 'standard')

    expect(impact.schedulesToPause.map((s) => s.id)).toEqual(['fifteen'])
  })

  it('leaves everything alone on an upgrade', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ interval: '15min' })])
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone()])

    const impact = await previewPlanChange(USER, 'premium')

    expect(impact.clean).toBe(true)
  })
})

describe('over the active-window limit (BR-005)', () => {
  it('keeps the oldest and pauses the newest', async () => {
    // free allows 10 active windows; make 11, all daily so interval is not the cause.
    const rows = Array.from({ length: 11 }, (_, i) =>
      schedule({
        id: `s${i}`,
        interval: 'daily',
        createdAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * DAY),
      }),
    )
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue(rows)

    const impact = await previewPlanChange(USER, 'free')

    // s10 is the newest. An older window is likelier to be the one they depend on.
    expect(impact.schedulesToPause.map((s) => s.id)).toEqual(['s10'])
    expect(impact.schedulesToPause[0]!.reason).toBe('over_schedule_limit')
  })

  it('ignores already-paused windows when counting', async () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => schedule({ id: `a${i}`, interval: 'daily' })),
      schedule({ id: 'paused', interval: 'daily', status: 'paused' }),
    ]
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue(rows)

    const impact = await previewPlanChange(USER, 'free')

    expect(impact.schedulesToPause).toHaveLength(0)
  })
})

describe('daily frame budget (BR-006)', () => {
  it('pauses until the worst day fits', async () => {
    // standard allows 50 frames/day. Four 07:00-23:00 hourly windows = 16 each = 64.
    const rows = Array.from({ length: 4 }, (_, i) =>
      schedule({
        id: `s${i}`,
        interval: 'hourly',
        startTime: '07:00',
        endTime: '23:00',
        days: [0],
        createdAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * DAY),
      }),
    )
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue(rows)

    const impact = await previewPlanChange(USER, 'standard')

    // 64 > 50, so the newest is paused; 48 then fits.
    expect(impact.schedulesToPause.map((s) => s.id)).toEqual(['s3'])
    expect(impact.schedulesToPause[0]!.reason).toBe('over_daily_frames')
  })

  it('judges the worst day, not the total across the week', async () => {
    // Each window is heavy but runs on a different day, so no single day is over.
    const rows = [0, 1, 2, 3, 4].map((day) =>
      schedule({ id: `d${day}`, interval: 'hourly', startTime: '07:00', endTime: '23:00', days: [day] }),
    )
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue(rows)

    const impact = await previewPlanChange(USER, 'standard')

    expect(impact.schedulesToPause).toHaveLength(0)
  })
})

describe('over the zone limit', () => {
  it('keeps the oldest zone and pauses the newer ones', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      zone({ id: `z${i}`, name: `Zona ${i}`, createdAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * DAY) }),
    )
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue(rows)

    const impact = await previewPlanChange(USER, 'free') // free allows 1

    expect(impact.zonesToPause.map((z) => z.id).sort()).toEqual(['z1', 'z2'])
    expect(impact.zonesToPause[0]!.reason).toBe('over_zone_limit')
  })

  it('does not count zones that are already paused', async () => {
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([
      zone({ id: 'live' }),
      zone({ id: 'already', status: 'paused' }),
    ])

    const impact = await previewPlanChange(USER, 'free')

    expect(impact.zonesToPause).toHaveLength(0)
  })
})

describe('preview and apply agree', () => {
  it('applies exactly what the preview described', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ id: 'sx', interval: '15min' })])
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone({ id: 'za' }), zone({ id: 'zb' })])

    const preview = await previewPlanChange(USER, 'free')
    const applied = await applyPlanChange(USER, 'free')

    // The confirmation dialog and the outcome run the same function, so they cannot
    // describe different things — the usual failure mode for a warning dialog.
    expect(applied.schedulesToPause).toEqual(preview.schedulesToPause)
    expect(applied.zonesToPause).toEqual(preview.zonesToPause)
  })

  it('reports clean when nothing would change', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ interval: 'daily' })])
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone()])

    const impact = await previewPlanChange(USER, 'free')

    expect(impact.clean).toBe(true)
    expect(impact.plan).toBe('free')
  })
})

describe('each paused item explains itself', () => {
  it('carries a human reason the dialog can render', async () => {
    vi.mocked(scheduleRepo.findByUserId).mockResolvedValue([schedule({ label: 'Jam sibuk pagi', interval: 'hourly' })])

    const impact = await previewPlanChange(USER, 'free')

    expect(impact.schedulesToPause[0]).toMatchObject({
      name: 'Jam sibuk pagi',
      detail: expect.stringContaining('paket baru'),
    })
  })
})
