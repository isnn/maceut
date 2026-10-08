import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/capture.repository', () => ({
  findById: vi.fn(),
  hasNewerPending: vi.fn(),
  markStatus: vi.fn(),
}))
vi.mock('../repositories/schedule.repository', () => ({ findById: vi.fn() }))
vi.mock('../repositories/zone.repository', () => ({ findById: vi.fn() }))
vi.mock('../services/here-usage.service', () => ({ meteredTrafficFlow: vi.fn() }))
vi.mock('../services/notification.service', () => ({ onCaptureDone: vi.fn(), onCaptureFailed: vi.fn() }))
vi.mock('../lib/rabbitmq-client', () => ({ publishRenderJob: vi.fn(), safeAck: vi.fn(), safeNack: vi.fn() }))

import { runCapture, staleReason, lateToleranceMs } from './capture.worker'
import * as captureRepo from '../repositories/capture.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import { meteredTrafficFlow } from '../services/here-usage.service'

const due = new Date('2026-10-08T06:30:00Z')
const minutes = (n: number) => new Date(due.getTime() + n * 60_000)

function capture(over: Record<string, unknown> = {}) {
  return {
    id: 'cap',
    userId: 'user_01',
    zoneId: 'zone',
    scheduleId: 'sched',
    trigger: 'scheduled',
    status: 'pending',
    scheduledFor: due,
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(captureRepo.hasNewerPending).mockResolvedValue(false)
  vi.mocked(scheduleRepo.findById).mockResolvedValue({ interval: '15min' } as never)
})

describe('staleReason (late cycles after a worker outage)', () => {
  it('collects a cycle that starts on time', async () => {
    expect(await staleReason(capture(), minutes(0.1))).toBeNull()
  })

  it('collects a late cycle still within one interval', async () => {
    expect(await staleReason(capture(), minutes(14))).toBeNull()
  })

  it('skips a cycle when a newer one for the same zone is waiting', async () => {
    vi.mocked(captureRepo.hasNewerPending).mockResolvedValue(true)
    expect(await staleReason(capture(), minutes(1))).toMatch(/later capture of this zone/)
  })

  it('skips the newest cycle too once it is more than one interval late', async () => {
    expect(await staleReason(capture(), minutes(16))).toMatch(/16 minutes after it was due/)
  })

  it('allows an hour for hourly and daily windows, and for a deleted window', async () => {
    expect(lateToleranceMs('hourly')).toBe(60 * 60_000)
    expect(lateToleranceMs('daily')).toBe(60 * 60_000)
    vi.mocked(scheduleRepo.findById).mockResolvedValue(undefined)
    expect(await staleReason(capture({ scheduleId: null }), minutes(45))).toBeNull()
  })

  it('always collects a manual capture', async () => {
    vi.mocked(captureRepo.hasNewerPending).mockResolvedValue(true)
    expect(await staleReason(capture({ trigger: 'manual', scheduledFor: null }), minutes(300))).toBeNull()
  })
})

describe('runCapture', () => {
  it('records a stale cycle as missed without asking for traffic', async () => {
    vi.mocked(captureRepo.findById).mockResolvedValue(capture({ scheduledFor: new Date(Date.now() - 3 * 60 * 60_000) }))

    await runCapture('cap')

    expect(captureRepo.markStatus).toHaveBeenCalledWith('cap', 'missed', expect.stringMatching(/^Not collected/))
    expect(captureRepo.markStatus).not.toHaveBeenCalledWith('cap', 'processing')
    expect(meteredTrafficFlow).not.toHaveBeenCalled()
  })
})
