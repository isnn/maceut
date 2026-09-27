import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/zone.repository', () => ({ findByUserId: vi.fn(), findById: vi.fn() }))
vi.mock('../repositories/schedule.repository', () => ({ cadenceByZone: vi.fn() }))
vi.mock('../lib/here-traffic-client', () => ({
  getTrafficFlow: vi.fn(),
  functionalClassesFor: vi.fn(() => [1]),
  totalLengthMetres: vi.fn(() => 0),
  toKm: vi.fn(() => 0),
}))

import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import { getZonesForUser } from './zone.service'

const USER = 'user_01'

function zone(over: Record<string, unknown> = {}) {
  return {
    id: 'z1',
    userId: USER,
    name: 'Zona',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    roadClass: 'nasional',
    status: 'collecting',
    areaKm2: 1,
    roadsCount: null,
    lengthKm: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone()])
  vi.mocked(scheduleRepo.cadenceByZone).mockResolvedValue(new Map())
})

describe('zone cadence', () => {
  it('is null when nothing is scheduled', async () => {
    const [z] = await getZonesForUser(USER)

    // Absence, not a sentence. This used to be the constant "Belum dijadwalkan" —
    // Indonesian copy in an English interface, and the API inventing display text.
    expect(z!.cadence).toBeNull()
  })

  it('describes a single window with its hours', async () => {
    vi.mocked(scheduleRepo.cadenceByZone).mockResolvedValue(
      new Map([['z1', { activeWindows: 1, finestInterval: 'hourly', earliestStart: '07:00', latestEnd: '09:00' }]]),
    )

    expect((await getZonesForUser(USER))[0]!.cadence).toBe('Hourly · 07:00–09:00')
  })

  it('counts windows instead of listing hours once there are several', async () => {
    vi.mocked(scheduleRepo.cadenceByZone).mockResolvedValue(
      new Map([['z1', { activeWindows: 4, finestInterval: 'hourly', earliestStart: '07:00', latestEnd: '21:00' }]]),
    )

    // "07:00–21:00" across four windows would imply continuous collection it does not do.
    expect((await getZonesForUser(USER))[0]!.cadence).toBe('Hourly · 4 windows')
  })

  it('reports the finest interval in play', async () => {
    vi.mocked(scheduleRepo.cadenceByZone).mockResolvedValue(
      new Map([['z1', { activeWindows: 2, finestInterval: '15min', earliestStart: '07:00', latestEnd: '09:00' }]]),
    )

    expect((await getZonesForUser(USER))[0]!.cadence).toBe('Every 15 min · 2 windows')
  })

  it('reads as unscheduled when every window is paused', async () => {
    // cadenceByZone only counts active rows, so a fully paused zone is simply absent —
    // which is the one case where "not scheduled" is the true answer.
    vi.mocked(scheduleRepo.cadenceByZone).mockResolvedValue(new Map())

    expect((await getZonesForUser(USER))[0]!.cadence).toBeNull()
  })

  it('asks for cadence once for the whole list, not once per zone', async () => {
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone({ id: 'a' }), zone({ id: 'b' }), zone({ id: 'c' })])

    await getZonesForUser(USER)

    expect(scheduleRepo.cadenceByZone).toHaveBeenCalledTimes(1)
  })
})
