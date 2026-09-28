import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/capture.repository', () => ({ findById: vi.fn(), setImage: vi.fn() }))
vi.mock('../repositories/zone.repository', () => ({ findById: vi.fn() }))
vi.mock('../lib/r2-client', () => ({
  upload: vi.fn(),
  capturePath: vi.fn(() => 'captures/user_01/2026/09/cap.png'),
}))
vi.mock('../lib/render-page', () => ({
  launchBrowser: vi.fn(async () => ({ isConnected: () => true, on: vi.fn(), close: vi.fn(async () => undefined) })),
  renderWithPage: vi.fn(),
}))

import { renderCaptureImage, captureImageSpec } from './render.worker'
import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import { upload } from '../lib/r2-client'
import { renderWithPage } from '../lib/render-page'

const ring: [number, number][] = [
  [106.8, -6.2],
  [106.81, -6.2],
  [106.81, -6.21],
  [106.8, -6.2],
]

function capture(over: Record<string, unknown> = {}) {
  return {
    id: 'cap',
    userId: 'user_01',
    zoneId: 'zone',
    status: 'done',
    capturedAt: new Date('2026-09-27T00:30:00Z'),
    filePath: null,
    traffic: { type: 'FeatureCollection', features: [] },
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(zoneRepo.findById).mockResolvedValue({ name: 'Sudirman', geometry: { type: 'Polygon', coordinates: [ring] } } as never)
  vi.mocked(renderWithPage).mockResolvedValue({ pngs: [{ name: 'x.png', data: Buffer.from('png-bytes') }], video: Buffer.alloc(0) })
})

describe('renderCaptureImage', () => {
  it('renders one PNG, uploads it to the capture path and records it with its style', async () => {
    vi.mocked(captureRepo.findById).mockResolvedValue(capture())

    await renderCaptureImage('cap')

    const job = vi.mocked(renderWithPage).mock.calls[0]![1]
    expect(job).toMatchObject({ format: 'png', frameCount: 1, zoneName: 'Sudirman', ring })
    expect(upload).toHaveBeenCalledWith('captures/user_01/2026/09/cap.png', Buffer.from('png-bytes'), 'image/png')
    expect(captureRepo.setImage).toHaveBeenCalledWith('cap', 'captures/user_01/2026/09/cap.png', 9, captureImageSpec())
  })

  it('always draws the legend (BR-019)', () => {
    expect((captureImageSpec().overlay as { legend: boolean }).legend).toBe(true)
  })

  it('skips a capture that already has an image — a duplicate delivery', async () => {
    vi.mocked(captureRepo.findById).mockResolvedValue(capture({ filePath: 'captures/done.png' }))
    await renderCaptureImage('cap')
    expect(renderWithPage).not.toHaveBeenCalled()
  })

  it('skips a capture that is not done', async () => {
    vi.mocked(captureRepo.findById).mockResolvedValue(capture({ status: 'failed' }))
    await renderCaptureImage('cap')
    expect(renderWithPage).not.toHaveBeenCalled()
  })

  it('stores nothing when the render produced no image', async () => {
    vi.mocked(captureRepo.findById).mockResolvedValue(capture())
    vi.mocked(renderWithPage).mockResolvedValue({ pngs: [], video: Buffer.alloc(0) })

    await expect(renderCaptureImage('cap')).rejects.toThrow('no image')
    expect(upload).not.toHaveBeenCalled()
    expect(captureRepo.setImage).not.toHaveBeenCalled()
  })
})
