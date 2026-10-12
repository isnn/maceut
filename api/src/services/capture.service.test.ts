import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/capture.repository', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  markStatus: vi.fn(),
  countInRange: vi.fn(),
  listByZone: vi.fn(),
}))
vi.mock('../repositories/zone.repository', () => ({ findById: vi.fn() }))
vi.mock('../repositories/user.repository', () => ({ findByIdWithPlan: vi.fn() }))
vi.mock('../lib/rabbitmq-client', () => ({ publishCaptureJob: vi.fn() }))

import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as userRepo from '../repositories/user.repository'
import { publishCaptureJob } from '../lib/rabbitmq-client'
import { enqueueCapture } from './capture.service'
import { ForbiddenError, NotFoundError } from '../errors'
import type { Plan, RoadClass } from '../types/plan'

const USER = 'user_01'
const ZONE = 'zone_01'

function captureRow(over: Record<string, unknown> = {}) {
  return {
    id: 'cap_01',
    userId: USER,
    zoneId: ZONE,
    scheduleId: null,
    status: 'pending',
    trigger: 'manual',
    roadClass: 'nasional',
    roadsCount: null,
    jamFactorAvg: null,
    filePath: null,
    fileSize: null,
    error: null,
    capturedAt: new Date('2026-09-22T12:27:00Z'),
    createdAt: new Date('2026-09-22T12:27:00Z'),
    ...over,
  } as never
}

function signedIn(plan: Plan, zoneRoadClass: RoadClass = 'semua') {
  vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE, userId: USER, roadClass: zoneRoadClass } as never)
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ id: USER, plan } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  signedIn('premium')
  vi.mocked(captureRepo.countInRange).mockResolvedValue(0)
  vi.mocked(captureRepo.create).mockImplementation(async (input) => captureRow({ ...input }))
})

describe('enqueueCapture — ownership', () => {
  it('rejects a zone that does not exist', async () => {
    vi.mocked(zoneRepo.findById).mockResolvedValue(undefined as never)

    await expect(enqueueCapture(USER, ZONE)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('rejects someone else’s zone', async () => {
    vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE, userId: 'someone_else', roadClass: 'semua' } as never)

    await expect(enqueueCapture(USER, ZONE)).rejects.toBeInstanceOf(ForbiddenError)
    expect(captureRepo.create).not.toHaveBeenCalled()
  })
})

describe('enqueueCapture — BR-006 monthly pool (delivery doc F5)', () => {
  it('queues while under the pool', async () => {
    vi.mocked(captureRepo.countInRange).mockResolvedValue(2999) // premium's pool is 3,000

    const out = await enqueueCapture(USER, ZONE)

    expect(out.queued).toBe(true)
    expect(publishCaptureJob).toHaveBeenCalledWith({ captureId: 'cap_01' })
  })

  it('refuses once the pool is used and records why (BR-008)', async () => {
    vi.mocked(captureRepo.countInRange).mockResolvedValue(3000)

    const out = await enqueueCapture(USER, ZONE)

    // Recorded rather than dropped: a zone that stopped collecting is only
    // diagnosable if the reason was written down.
    expect(out.queued).toBe(false)
    expect(out.capture.status).toBe('skipped_limit')
    expect(captureRepo.create).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('3000') }))
    expect(publishCaptureJob).not.toHaveBeenCalled()
  })

  it('records the 46th Free capture of the month as skipped', async () => {
    signedIn('free')
    vi.mocked(captureRepo.countInRange).mockResolvedValue(45)

    const out = await enqueueCapture(USER, ZONE)

    expect(out.capture.status).toBe('skipped_limit')
    expect(publishCaptureJob).not.toHaveBeenCalled()
  })

  it('applies each plan’s own pool', async () => {
    for (const [plan, pool] of [['free', 45], ['starter', 450], ['standard', 2000], ['premium', 3000]] as const) {
      signedIn(plan)
      vi.mocked(captureRepo.countInRange).mockResolvedValue(pool - 1)
      expect((await enqueueCapture(USER, ZONE)).queued, plan).toBe(true)
      vi.mocked(captureRepo.countInRange).mockResolvedValue(pool)
      expect((await enqueueCapture(USER, ZONE)).queued, plan).toBe(false)
    }
  })

  it('counts the current WIB month', async () => {
    vi.useFakeTimers()
    // 31 Oct 2026 20:00 UTC is already 1 Nov 03:00 in Jakarta: November's pool.
    vi.setSystemTime(new Date('2026-10-31T20:00:00Z'))
    try {
      await enqueueCapture(USER, ZONE)
      const [, start, end] = vi.mocked(captureRepo.countInRange).mock.calls[0]!
      expect(start.toISOString()).toBe('2026-10-31T17:00:00.000Z')
      expect(end.toISOString()).toBe('2026-11-30T17:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('enqueueCapture — BR-022 road class at capture time', () => {
  it('caps the zone’s class to the plan', async () => {
    // The zone keeps `semua`; a free account collects only `nasional` from it.
    signedIn('free', 'semua')

    await enqueueCapture(USER, ZONE)

    expect(captureRepo.create).toHaveBeenCalledWith(expect.objectContaining({ roadClass: 'nasional' }))
  })

  it('never widens beyond what the zone asked for', async () => {
    signedIn('premium', 'nasional')

    await enqueueCapture(USER, ZONE)

    expect(captureRepo.create).toHaveBeenCalledWith(expect.objectContaining({ roadClass: 'nasional' }))
  })

  it('stores the effective class on the row', async () => {
    signedIn('standard', 'semua')

    const out = await enqueueCapture(USER, ZONE)

    // Stored per capture so a frame stays explainable later without replaying the
    // account's plan history.
    expect(out.capture.roadClass).toBe('nasional_provinsi')
  })
})

describe('enqueueCapture — queueing', () => {
  it('records the schedule that fired it', async () => {
    await enqueueCapture(USER, ZONE, { trigger: 'scheduled', scheduleId: 'sched_01' })

    expect(captureRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'scheduled', scheduleId: 'sched_01' }),
    )
  })

  it('marks the capture failed when the broker is down', async () => {
    vi.mocked(publishCaptureJob).mockRejectedValue(new Error('ECONNREFUSED'))
    vi.mocked(captureRepo.findById).mockResolvedValue(captureRow({ status: 'failed', error: 'ECONNREFUSED' }))

    const out = await enqueueCapture(USER, ZONE)

    // The row already exists, so a broker outage leaves visible evidence rather than a
    // cycle that appears never to have been attempted.
    expect(out.queued).toBe(false)
    expect(captureRepo.markStatus).toHaveBeenCalledWith('cap_01', 'failed', expect.stringContaining('ECONNREFUSED'))
  })
})
