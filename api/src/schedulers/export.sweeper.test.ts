import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/export.repository', () => ({
  findStale: vi.fn(),
  findExpired: vi.fn(),
  fail: vi.fn(async () => true),
  markExpired: vi.fn(),
  setUploadId: vi.fn(async () => undefined),
}))
vi.mock('../lib/r2-client', () => ({ remove: vi.fn(), MultipartUpload: { abortById: vi.fn(async () => undefined) } }))
vi.mock('../services/export.service', () => ({ exportPath: (row: { id: string }) => `exports/u1/${row.id}.zip` }))
vi.mock('../services/notification.service', () => ({ onExportFinished: vi.fn(async () => undefined) }))
vi.mock('../repositories/render-cache.repository', () => ({ findOlderThan: vi.fn(async () => []), remove: vi.fn(async () => undefined) }))

import * as exportRepo from '../repositories/export.repository'
import * as r2 from '../lib/r2-client'
import { sweep } from './export.sweeper'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(exportRepo.findStale).mockResolvedValue([])
  vi.mocked(exportRepo.findExpired).mockResolvedValue([])
})

describe('export sweeper', () => {
  it('fails renders whose heartbeat stopped more than two minutes ago', async () => {
    const now = new Date('2026-09-28T10:00:00Z')
    vi.mocked(exportRepo.findStale).mockResolvedValue([{ id: 'e1', updatedAt: new Date('2026-09-28T09:55:00Z') }] as never)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const r = await sweep(now)

    expect(exportRepo.findStale).toHaveBeenCalledWith(new Date('2026-09-28T09:58:00Z'))
    expect(exportRepo.fail).toHaveBeenCalledWith('e1', expect.stringContaining('berhenti'))
    expect(r.failed).toBe(1)
  })

  it('deletes expired files and keeps the row as history', async () => {
    vi.mocked(exportRepo.findExpired).mockResolvedValue([{ id: 'e2', filePath: 'exports/u/e2.zip' }] as never)

    const r = await sweep()

    expect(r2.remove).toHaveBeenCalledWith('exports/u/e2.zip')
    expect(exportRepo.markExpired).toHaveBeenCalledWith('e2')
    expect(r.expired).toBe(1)
  })

  it('leaves a row done for the next tick when its file cannot be deleted', async () => {
    vi.mocked(exportRepo.findExpired).mockResolvedValue([{ id: 'e3', filePath: 'exports/u/e3.zip' }] as never)
    vi.mocked(r2.remove).mockRejectedValueOnce(new Error('R2 down'))

    const r = await sweep()

    expect(exportRepo.markExpired).not.toHaveBeenCalled()
    expect(r.expired).toBe(0)
  })

  it("aborts a stalled export's open upload, so its parts don't stay in R2", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(exportRepo.findStale).mockResolvedValue([
      { id: 'e9', uploadId: 'up-9', updatedAt: new Date('2026-10-05T09:00:00Z') },
    ] as never)

    await sweep(new Date('2026-10-05T10:00:00Z'))

    expect(r2.MultipartUpload.abortById).toHaveBeenCalledWith('exports/u1/e9.zip', 'up-9')
    expect(exportRepo.setUploadId).toHaveBeenCalledWith('e9', null)
  })
})
