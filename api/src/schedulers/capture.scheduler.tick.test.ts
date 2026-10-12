import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/schedule.repository', () => ({
  claimDue: vi.fn(),
  setNextFireAt: vi.fn(async () => undefined),
}))
vi.mock('../services/capture.service', () => ({
  enqueueCapture: vi.fn(async () => ({ queued: true })),
  recordMissed: vi.fn(async () => undefined),
}))
vi.mock('../services/notification.service', () => ({ onCapturesMissed: vi.fn(async () => undefined) }))

import * as scheduleRepo from '../repositories/schedule.repository'
import * as captureService from '../services/capture.service'
import { tick } from './capture.scheduler'

// Tue 07:00 WIB, the first firing of the window below.
const NOW = new Date('2026-09-22T00:00:00Z')

function due(over: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    userId: 'u1',
    zoneId: 'z1',
    label: 'Pagi',
    startTime: '07:00',
    endTime: '09:00',
    interval: 'hourly',
    days: [0, 1, 2, 3, 4],
    status: 'active',
    pausedByPlan: false,
    nextFireAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    dueAt: NOW,
    zonePaused: false,
    ...over,
  } as never
}

beforeEach(() => vi.clearAllMocks())

describe('tick and paused zones', () => {
  it('captures nothing for a window whose zone is paused, but moves the window on', async () => {
    vi.mocked(scheduleRepo.claimDue).mockResolvedValue([due({ zonePaused: true })])

    const result = await tick(NOW)

    expect(captureService.enqueueCapture).not.toHaveBeenCalled()
    expect(captureService.recordMissed).not.toHaveBeenCalled()
    expect(scheduleRepo.setNextFireAt).toHaveBeenCalledWith('w1', expect.any(Date))
    expect(result).toMatchObject({ fired: 0, zonePaused: 1 })
  })

  it('still captures for a collecting zone', async () => {
    vi.mocked(scheduleRepo.claimDue).mockResolvedValue([due()])

    const result = await tick(NOW)

    expect(captureService.enqueueCapture).toHaveBeenCalledWith('u1', 'z1', expect.objectContaining({ trigger: 'scheduled' }))
    expect(result).toMatchObject({ fired: 1, zonePaused: 0 })
  })
})
