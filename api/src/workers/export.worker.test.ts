import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/export.repository', () => ({
  markRendering: vi.fn(),
  reportProgress: vi.fn(async () => true),
  touch: vi.fn(async () => undefined),
  setUploadId: vi.fn(async () => undefined),
  markUploading: vi.fn(async () => true),
  complete: vi.fn(async () => true),
  fail: vi.fn(async () => true),
}))
vi.mock('../repositories/capture.repository', () => ({
  findById: vi.fn(async (id: string) => ({ id, capturedAt: new Date('2026-10-05T00:00:00Z'), traffic: null })),
}))
vi.mock('../repositories/zone.repository', () => ({
  findById: vi.fn(async () => ({ geometry: { coordinates: [[[110, -7], [110.1, -7], [110.1, -7.1], [110, -7]]] } })),
}))
vi.mock('../services/notification.service', () => ({ onExportFinished: vi.fn(async () => undefined) }))
vi.mock('../services/export.service', () => ({
  exportPath: () => 'exports/u1/e1.zip',
  expiryFrom: () => new Date('2026-10-12T00:00:00Z'),
}))
vi.mock('../services/capture.service', () => ({ slimTraffic: () => ({ type: 'FeatureCollection', features: [] }) }))
vi.mock('../lib/render-page', () => ({
  launchBrowser: vi.fn(async () => ({ isConnected: () => true, close: vi.fn(async () => undefined) })),
  renderWithPage: vi.fn(),
}))

const upload = vi.hoisted(() => ({
  chunks: [] as Buffer[],
  completed: false,
  aborted: false,
}))
vi.mock('../lib/r2-client', () => ({
  remove: vi.fn(async () => undefined),
  upload: vi.fn(async () => undefined),
  MultipartUpload: {
    start: vi.fn(async () => ({
      uploadId: 'up-1',
      get bytes() {
        return upload.chunks.reduce((n, c) => n + c.length, 0)
      },
      write: async (c: Buffer) => void upload.chunks.push(c),
      complete: async () => void (upload.completed = true),
      abort: async () => void (upload.aborted = true),
    })),
    abortById: vi.fn(),
  },
}))

import { runExport, MAX_BROWSER_RESTARTS } from './export.worker'
import * as exportRepo from '../repositories/export.repository'
import * as notificationService from '../services/notification.service'
import * as r2 from '../lib/r2-client'
import { launchBrowser, renderWithPage, type RenderBridge, type RenderPageJob } from '../lib/render-page'

const FRAMES = 5

function exportRow(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    userId: 'u1',
    zoneId: 'z1',
    format: 'zip',
    spec: { zoneName: 'YOG', width: 1600, height: 1000, themeId: 'dark', congestionId: 'standard', overlay: {}, view: {}, holdMs: 1000 },
    frameIds: Array.from({ length: FRAMES }, (_, i) => `c${i}`),
    ...over,
  } as never
}

/** A fake render page: draws frames from job.startFrame, optionally crashing at one. */
function page(opts: { crashAt?: number[]; error?: string; cancelAt?: number } = {}) {
  const crashes = [...(opts.crashAt ?? [])]
  const starts: number[] = []
  vi.mocked(renderWithPage).mockImplementation(async (_b, job: RenderPageJob, bridge: RenderBridge) => {
    const start = job.startFrame ?? 0
    starts.push(start)
    for (let i = start; i < job.frameCount; i++) {
      if (crashes[0] === i) {
        crashes.shift()
        throw new Error(opts.error ?? 'page.evaluate: Target crashed')
      }
      await bridge.frame(i)
      await bridge.png!(i, `${i + 1}.png`, Buffer.from(`png-${i}`), { drawMs: 10, encodeMs: 4 })
      if (opts.cancelAt === i) vi.mocked(exportRepo.reportProgress).mockResolvedValueOnce(false)
      if (!(await bridge.progress!(i + 1))) return { pngs: [], video: Buffer.alloc(0) }
    }
    return { pngs: [], video: Buffer.alloc(0) }
  })
  return starts
}

/** File names inside the uploaded ZIP, read from its local headers. */
function zipNames(): string[] {
  const zip = Buffer.concat(upload.chunks)
  const names: string[] = []
  let at = 0
  while (zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18)
    const nameLen = zip.readUInt16LE(at + 26)
    names.push(zip.subarray(at + 30, at + 30 + nameLen).toString())
    at += 30 + nameLen + size
  }
  return names
}

beforeEach(() => {
  vi.clearAllMocks()
  upload.chunks = []
  upload.completed = false
  upload.aborted = false
  vi.mocked(exportRepo.markRendering).mockResolvedValue(exportRow())
  vi.mocked(exportRepo.reportProgress).mockResolvedValue(true)
  vi.mocked(exportRepo.markUploading).mockResolvedValue(true)
  vi.mocked(exportRepo.complete).mockResolvedValue(true)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('runExport — ZIP', () => {
  it('streams every frame into the upload and marks the export done', async () => {
    page()
    await runExport('e1')

    expect(zipNames()).toEqual(['1.png', '2.png', '3.png', '4.png', '5.png'])
    expect(upload.completed).toBe(true)
    expect(exportRepo.setUploadId).toHaveBeenCalledWith('e1', 'up-1')
    const bytes = upload.chunks.reduce((n, c) => n + c.length, 0)
    expect(exportRepo.complete).toHaveBeenCalledWith('e1', 'exports/u1/e1.zip', bytes, expect.any(Date))
    expect(notificationService.onExportFinished).toHaveBeenCalledWith('e1')
  })

  it('resumes after a browser crash from the next frame, without repeating frames', async () => {
    const starts = page({ crashAt: [2] })
    await runExport('e1')

    expect(starts).toEqual([0, 2]) // the second browser starts where the first stopped
    expect(launchBrowser).toHaveBeenCalledTimes(2)
    expect(zipNames()).toEqual(['1.png', '2.png', '3.png', '4.png', '5.png'])
    expect(upload.completed).toBe(true)
    expect(exportRepo.fail).not.toHaveBeenCalled()
  })

  it(`gives up after ${MAX_BROWSER_RESTARTS} restarts, and discards the partial upload`, async () => {
    page({ crashAt: [1, 2, 3] })
    await runExport('e1')

    expect(exportRepo.fail).toHaveBeenCalledWith('e1', expect.stringContaining('Target crashed'))
    expect(upload.aborted).toBe(true)
    expect(upload.completed).toBe(false)
    expect(exportRepo.setUploadId).toHaveBeenLastCalledWith('e1', null)
  })

  it('does not retry an error that is not a browser crash', async () => {
    page({ crashAt: [1], error: 'page.goto: net::ERR_CONNECTION_REFUSED' })
    await runExport('e1')

    expect(launchBrowser).toHaveBeenCalledTimes(1)
    expect(exportRepo.fail).toHaveBeenCalled()
    expect(upload.aborted).toBe(true)
  })

  it('stops and discards the upload when the user cancels mid-render', async () => {
    page({ cancelAt: 1 })
    await runExport('e1')

    expect(upload.aborted).toBe(true)
    expect(exportRepo.markUploading).not.toHaveBeenCalled()
    expect(exportRepo.complete).not.toHaveBeenCalled()
    expect(notificationService.onExportFinished).not.toHaveBeenCalled()
  })

  it('never marks a cancelled export done, even when cancelled after the last frame (#58)', async () => {
    page()
    vi.mocked(exportRepo.markUploading).mockResolvedValue(false)
    await runExport('e1')

    expect(upload.completed).toBe(false)
    expect(upload.aborted).toBe(true)
    expect(exportRepo.complete).not.toHaveBeenCalled()
    expect(notificationService.onExportFinished).not.toHaveBeenCalled()
  })

  it('deletes the file when the export is cancelled during the final upload (#58)', async () => {
    page()
    vi.mocked(exportRepo.complete).mockResolvedValue(false)
    await runExport('e1')

    expect(r2.remove).toHaveBeenCalledWith('exports/u1/e1.zip')
    expect(notificationService.onExportFinished).not.toHaveBeenCalled()
  })

  it('skips an export that is no longer queued', async () => {
    vi.mocked(exportRepo.markRendering).mockResolvedValue(undefined)
    await runExport('e1')
    expect(renderWithPage).not.toHaveBeenCalled()
  })
})

describe('runExport — WebM', () => {
  it('uploads the recorded video and marks it done', async () => {
    vi.mocked(exportRepo.markRendering).mockResolvedValue(exportRow({ format: 'webm' }))
    vi.mocked(renderWithPage).mockResolvedValue({ pngs: [], video: Buffer.from('webm-bytes') })
    await runExport('e1')

    expect(r2.upload).toHaveBeenCalledWith('exports/u1/e1.zip', Buffer.from('webm-bytes'), 'video/webm')
    expect(exportRepo.complete).toHaveBeenCalledWith('e1', 'exports/u1/e1.zip', 10, expect.any(Date))
  })
})
