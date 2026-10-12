import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/capture.repository', () => ({
  softDeleteBefore: vi.fn(async () => 0),
  findPurgeable: vi.fn(async () => []),
  deleteByIds: vi.fn(async (ids: string[]) => ids.length),
}))
vi.mock('../lib/r2-client', () => ({
  remove: vi.fn(async () => undefined),
  thumbnailPath: (p: string) => p.replace(/\.png$/, '.thumb.jpg'),
}))
vi.mock('../config/env', () => ({ config: { retentionSweeperEnabled: false }, isR2Configured: () => true }))

import * as captureRepo from '../repositories/capture.repository'
import * as r2 from '../lib/r2-client'
import { cutoffs, sweepRetention } from './retention.sweeper'

const DAY = 86_400_000
const NOW = new Date('2026-10-12T05:00:00Z')

beforeEach(() => vi.clearAllMocks())

describe('retention cutoffs (H1)', () => {
  const { softBefore, purgeBefore } = cutoffs(NOW)
  const isSoft = (ageDays: number) => new Date(NOW.getTime() - ageDays * DAY) < softBefore
  const isPurged = (ageDays: number) => new Date(NOW.getTime() - ageDays * DAY) < purgeBefore

  it('soft-deletes a 31-day-old capture and leaves a 29-day-old one intact', () => {
    expect(isSoft(31)).toBe(true)
    expect(isSoft(29)).toBe(false)
  })

  it('keeps exactly 30 days: a capture at 30 days to the millisecond is not yet touched', () => {
    expect(isSoft(30)).toBe(false)
    expect(isSoft(30 + 1 / 86_400_000)).toBe(true)
  })

  it('deletes for good only after a year', () => {
    expect(isPurged(364)).toBe(false)
    expect(isPurged(366)).toBe(true)
  })
})

describe('sweepRetention', () => {
  it('soft-deletes with the 30-day cutoff and stops when a batch comes back short', async () => {
    vi.mocked(captureRepo.softDeleteBefore).mockResolvedValueOnce(500).mockResolvedValueOnce(12)

    const r = await sweepRetention(NOW)

    expect(captureRepo.softDeleteBefore).toHaveBeenCalledTimes(2)
    expect(captureRepo.softDeleteBefore).toHaveBeenCalledWith(cutoffs(NOW).softBefore, 500, NOW)
    expect(r.softDeleted).toBe(512)
  })

  it('removes the image and its thumbnail before deleting the row', async () => {
    vi.mocked(captureRepo.findPurgeable).mockResolvedValueOnce([
      { id: 'a', filePath: 'captures/u1/2025/09/a.png' },
      { id: 'b', filePath: null },
    ])

    const r = await sweepRetention(NOW)

    expect(r2.remove).toHaveBeenCalledWith('captures/u1/2025/09/a.png')
    expect(r2.remove).toHaveBeenCalledWith('captures/u1/2025/09/a.thumb.jpg')
    expect(captureRepo.deleteByIds).toHaveBeenCalledWith(['a', 'b'])
    expect(r).toMatchObject({ purged: 2, filesRemoved: 1 })
  })

  it('keeps a row whose file could not be removed, so the next tick retries it', async () => {
    vi.mocked(captureRepo.findPurgeable).mockResolvedValueOnce([
      { id: 'a', filePath: 'captures/u1/2025/09/a.png' },
      { id: 'b', filePath: 'captures/u1/2025/09/b.png' },
    ])
    vi.mocked(r2.remove).mockImplementation(async (p: string) => {
      if (p.includes('/a.')) throw new Error('R2 down')
    })

    const r = await sweepRetention(NOW)

    expect(captureRepo.deleteByIds).toHaveBeenCalledWith(['b'])
    expect(r.purged).toBe(1)
  })
})
