import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../lib/drizzle-client', () => ({ checkDb: vi.fn(), closeDb: vi.fn(), db: {}, pool: {} }))
vi.mock('../lib/rabbitmq-client', () => ({
  checkQueue: vi.fn(),
  closeQueue: vi.fn(),
  getChannel: vi.fn(),
  publishExportJob: vi.fn(),
}))
vi.mock('../lib/auth', () => ({ auth: { api: { getSession: vi.fn() }, handler: vi.fn() } }))
vi.mock('better-auth/node', () => ({
  toNodeHandler: () => (_req: unknown, res: { statusCode: number; end: (s: string) => void }) => {
    res.statusCode = 404
    res.end('')
  },
  fromNodeHeaders: (h: unknown) => h,
}))
vi.mock('../repositories/user.repository', () => ({ findById: vi.fn(), findByIdWithPlan: vi.fn() }))
vi.mock('../repositories/zone.repository', () => ({ findById: vi.fn() }))
vi.mock('../repositories/capture.repository', () => ({ findById: vi.fn(), findLiteById: vi.fn(), listDoneIdsBetween: vi.fn() }))
vi.mock('../repositories/export.repository', () => ({
  ACTIVE_STATUSES: ['queued', 'rendering', 'uploading'],
  create: vi.fn(),
  findById: vi.fn(),
  listByZone: vi.fn(),
  listRecentForUser: vi.fn(),
  findActiveForUser: vi.fn(),
  countAhead: vi.fn(async () => 0),
  fail: vi.fn(async () => true),
  remove: vi.fn(),
}))
vi.mock('../lib/r2-client', () => ({
  getPresignedUrl: vi.fn(async () => 'https://r2.example/signed'),
  remove: vi.fn(),
}))
vi.mock('../config/env', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isR2Configured: vi.fn(() => true) }
})

import { app } from '../app'
import * as userRepo from '../repositories/user.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as captureRepo from '../repositories/capture.repository'
import * as exportRepo from '../repositories/export.repository'
import * as r2 from '../lib/r2-client'
import { publishExportJob } from '../lib/rabbitmq-client'
import { isR2Configured } from '../config/env'
import { auth } from '../lib/auth'
import type { Plan } from '../types/plan'

const USER_ID = 'user_01'
const ZONE_ID = '3f8a1c2e-1111-4111-8111-111111111111'
const EXPORT_ID = '9b1d2c3e-2222-4222-8222-222222222222'
const CAP_A = 'aaaaaaaa-3333-4333-8333-333333333333'
const CAP_B = 'bbbbbbbb-4444-4444-8444-444444444444'

const spec = {
  themeId: 'daylight',
  congestionId: 'standard',
  overlay: {
    effect: 'vignette',
    title: '',
    textSize: 'medium',
    text: { x: 0.95, y: 0.84, align: 'right' },
    legend: false,
    boundary: false,
  },
  view: { zoomOffset: 0, panX: 0, panY: 0 },
  width: 1600,
  height: 1000,
  holdMs: 1000,
}

function signedIn(plan: Plan = 'standard') {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER_ID }, session: { id: 's' } } as never)
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan } as never)
}

function exportRow(over: Record<string, unknown> = {}) {
  return {
    id: EXPORT_ID,
    userId: USER_ID,
    zoneId: ZONE_ID,
    format: 'webm',
    status: 'queued',
    spec: { ...spec, range: { from: '2026-09-27T00:00:00.000Z', to: '2026-09-27T10:00:00.000Z' }, zoneName: 'Sudirman' },
    frameIds: [CAP_A, CAP_B],
    frameCount: 2,
    framesDone: 0,
    filePath: null,
    fileSize: null,
    error: null,
    createdAt: new Date('2026-09-28T01:00:00Z'),
    startedAt: null,
    updatedAt: new Date('2026-09-28T01:00:00Z'),
    finishedAt: null,
    expiresAt: null,
    ...over,
  } as never
}

/** `n` collected captures, one a minute. */
function frames(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `cap-${i}`, capturedAt: new Date(Date.UTC(2026, 8, 27, 0, i)) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isR2Configured).mockReturnValue(true)
  vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE_ID, userId: USER_ID, name: 'Sudirman' } as never)
  vi.mocked(exportRepo.findActiveForUser).mockResolvedValue(undefined)
  vi.mocked(captureRepo.findLiteById).mockImplementation(async (id: string) => ({
    id,
    zoneId: ZONE_ID,
    capturedAt: id === CAP_A ? new Date('2026-09-27T00:00:00Z') : new Date('2026-09-27T10:00:00Z'),
  }) as never)
  vi.mocked(captureRepo.listDoneIdsBetween).mockResolvedValue(frames(2))
  vi.mocked(exportRepo.create).mockResolvedValue(exportRow())
})

const body = (format = 'webm') => ({ format, startCaptureId: CAP_A, endCaptureId: CAP_B, spec })

describe('auth', () => {
  it('returns 401 for every export route without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    for (const [method, path] of [
      ['post', `/zones/${ZONE_ID}/exports`],
      ['get', `/zones/${ZONE_ID}/exports`],
      ['get', `/exports/${EXPORT_ID}`],
      ['delete', `/exports/${EXPORT_ID}`],
      ['post', `/exports/${EXPORT_ID}/retry`],
    ] as const) {
      const res = await request(app)[method](path)
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })
})

describe('POST /zones/:id/exports', () => {
  it('queues an export with the range resolved to capture ids, and answers 202', async () => {
    signedIn()
    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(body())

    expect(res.status).toBe(202)
    expect(res.body.data.status).toBe('queued')
    expect(res.body.data.queuePosition).toBe(0)
    expect(exportRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, zoneId: ZONE_ID, format: 'webm', frameIds: ['cap-0', 'cap-1'] }),
    )
    expect(publishExportJob).toHaveBeenCalledWith({ exportId: EXPORT_ID })
  })

  it('refuses a second export while one is active — 409 EXPORT_IN_PROGRESS', async () => {
    signedIn()
    vi.mocked(exportRepo.findActiveForUser).mockResolvedValue(exportRow({ status: 'rendering' }))

    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(body())

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EXPORT_IN_PROGRESS')
    expect(exportRepo.create).not.toHaveBeenCalled()
  })

  it('refuses more frames than the plan allows — 422 EXPORT_LIMIT_EXCEEDED', async () => {
    signedIn('free') // 60 frames
    vi.mocked(captureRepo.listDoneIdsBetween).mockResolvedValue(frames(61))

    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(body('zip'))

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('EXPORT_LIMIT_EXCEEDED')
    expect(res.body.error.details).toMatchObject({ limit: 60, requested: 61 })
  })

  it('refuses more frames × pixels than the plan budget — 422 EXPORT_BUDGET_EXCEEDED', async () => {
    signedIn('free') // 120 megapixel-frames
    vi.mocked(captureRepo.listDoneIdsBetween).mockResolvedValue(frames(40))
    // 40 frames at 4000×4000 = 640 MP·frames — under the frame cap, far over the budget.
    const big = { ...body('zip'), spec: { ...spec, width: 4000, height: 4000 } }

    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(big)

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('EXPORT_BUDGET_EXCEEDED')
    expect(res.body.error.details).toMatchObject({ budget: 120, requested: 640, maxFrames: 7 })
    expect(exportRepo.create).not.toHaveBeenCalled()
  })

  it('refuses an animation of a single frame', async () => {
    signedIn()
    vi.mocked(captureRepo.listDoneIdsBetween).mockResolvedValue(frames(1))

    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(body('webm'))

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('refuses captures from another zone', async () => {
    signedIn()
    vi.mocked(captureRepo.findLiteById).mockResolvedValue({ id: CAP_A, zoneId: 'other', capturedAt: new Date() } as never)

    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(body())

    expect(res.status).toBe(422)
    expect(exportRepo.create).not.toHaveBeenCalled()
  })

  it("returns 403 for another account's zone", async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE_ID, userId: 'someone-else', name: 'x' } as never)

    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(body())

    expect(res.status).toBe(403)
  })

  it('refuses up front when storage is not configured, rather than after rendering', async () => {
    signedIn()
    vi.mocked(isR2Configured).mockReturnValue(false)

    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(body())

    expect(res.status).toBe(502)
    expect(exportRepo.create).not.toHaveBeenCalled()
  })

  it('fails the row, rather than leaving it queued forever, when the queue is down', async () => {
    signedIn()
    vi.mocked(publishExportJob).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const res = await request(app).post(`/zones/${ZONE_ID}/exports`).send(body())

    expect(res.status).toBe(502)
    expect(exportRepo.fail).toHaveBeenCalledWith(EXPORT_ID, expect.any(String))
  })

  it('validates the spec — a size past 4000px is a 422', async () => {
    signedIn()
    const res = await request(app)
      .post(`/zones/${ZONE_ID}/exports`)
      .send({ ...body(), spec: { ...spec, width: 9000 } })

    expect(res.status).toBe(422)
  })
})

describe('GET /exports/:id', () => {
  it('derives progress and time left from the row while rendering', async () => {
    signedIn()
    const startedAt = new Date(Date.now() - 20_000) // 10 of 50 frames in 20 s → 2 s a frame
    vi.mocked(exportRepo.findById).mockResolvedValue(
      exportRow({ status: 'rendering', frameCount: 50, framesDone: 10, startedAt }),
    )

    const res = await request(app).get(`/exports/${EXPORT_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.data.progress).toBeCloseTo(0.2)
    expect(res.body.data.etaSeconds).toBeGreaterThanOrEqual(79)
    expect(res.body.data.etaSeconds).toBeLessThanOrEqual(81)
    expect(res.body.data.downloadUrl).toBeNull()
  })

  it('carries a signed download link once done', async () => {
    signedIn()
    vi.mocked(exportRepo.findById).mockResolvedValue(
      exportRow({ status: 'done', framesDone: 2, filePath: `exports/${USER_ID}/${EXPORT_ID}.webm`, fileSize: 1234 }),
    )

    const res = await request(app).get(`/exports/${EXPORT_ID}`)

    expect(res.body.data.downloadUrl).toBe('https://r2.example/signed')
    expect(r2.getPresignedUrl).toHaveBeenCalledWith(
      `exports/${USER_ID}/${EXPORT_ID}.webm`,
      expect.any(Number),
      'Sudirman-2026-09-27_0700-1700.webm',
    )
  })

  it("returns 403 for another account's export", async () => {
    signedIn()
    vi.mocked(exportRepo.findById).mockResolvedValue(exportRow({ userId: 'someone-else' }))

    const res = await request(app).get(`/exports/${EXPORT_ID}`)

    expect(res.status).toBe(403)
  })
})

describe('GET /exports', () => {
  it("lists the account's latest exports across zones, with the zone's name", async () => {
    signedIn()
    vi.mocked(exportRepo.listRecentForUser).mockResolvedValue([exportRow({ status: 'done', filePath: 'exports/u/e.webm' })])

    const res = await request(app).get('/exports?limit=3')

    expect(res.status).toBe(200)
    expect(exportRepo.listRecentForUser).toHaveBeenCalledWith(USER_ID, 3)
    expect(res.body.data[0]).toMatchObject({ id: EXPORT_ID, zoneName: 'Sudirman', status: 'done', downloadUrl: 'https://r2.example/signed' })
  })

  it('defaults to 5 and caps the limit at 20', async () => {
    signedIn()
    vi.mocked(exportRepo.listRecentForUser).mockResolvedValue([])
    await request(app).get('/exports')
    expect(exportRepo.listRecentForUser).toHaveBeenCalledWith(USER_ID, 5)
    expect((await request(app).get('/exports?limit=50')).status).toBe(422)
  })

  it('requires a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    expect((await request(app).get('/exports')).status).toBe(401)
  })
})

describe('GET /zones/:id/exports', () => {
  it("lists the zone's exports", async () => {
    signedIn()
    vi.mocked(exportRepo.listByZone).mockResolvedValue([exportRow(), exportRow({ id: 'x', status: 'failed' })])

    const res = await request(app).get(`/zones/${ZONE_ID}/exports`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})

describe('DELETE /exports/:id', () => {
  it('cancels an export that is still running', async () => {
    signedIn()
    vi.mocked(exportRepo.findById).mockResolvedValue(exportRow({ status: 'rendering' }))

    const res = await request(app).delete(`/exports/${EXPORT_ID}`)

    expect(res.body.data).toEqual({ cancelled: true })
    expect(exportRepo.fail).toHaveBeenCalledWith(EXPORT_ID, 'Dibatalkan.')
    expect(exportRepo.remove).not.toHaveBeenCalled()
  })

  it('deletes a finished export and its file', async () => {
    signedIn()
    vi.mocked(exportRepo.findById).mockResolvedValue(
      exportRow({ status: 'done', filePath: `exports/${USER_ID}/${EXPORT_ID}.webm` }),
    )

    const res = await request(app).delete(`/exports/${EXPORT_ID}`)

    expect(res.body.data).toEqual({ cancelled: false })
    expect(r2.remove).toHaveBeenCalledWith(`exports/${USER_ID}/${EXPORT_ID}.webm`)
    expect(exportRepo.remove).toHaveBeenCalledWith(EXPORT_ID)
  })
})

describe('POST /exports/:id/retry', () => {
  it('queues a new export with the same settings and frames', async () => {
    signedIn()
    vi.mocked(exportRepo.findById).mockResolvedValue(exportRow({ status: 'failed', error: 'boom' }))

    const res = await request(app).post(`/exports/${EXPORT_ID}/retry`)

    expect(res.status).toBe(202)
    expect(exportRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: ZONE_ID, format: 'webm', frameIds: [CAP_A, CAP_B] }),
    )
    expect(publishExportJob).toHaveBeenCalled()
  })

  it('refuses to retry an export that is still running', async () => {
    signedIn()
    vi.mocked(exportRepo.findById).mockResolvedValue(exportRow({ status: 'rendering' }))

    const res = await request(app).post(`/exports/${EXPORT_ID}/retry`)

    expect(res.status).toBe(409)
    expect(exportRepo.create).not.toHaveBeenCalled()
  })
})

describe('export filenames', () => {
  it('name the timeframe in WIB, the clock printed on every image', async () => {
    const { fileNameFor } = await import('../services/export.service')
    // 22 Sep 12:24 UTC and 23 Sep 12:00 UTC = 19:24 WIB on the 22nd to 19:00 WIB on the 23rd.
    expect(
      fileNameFor({ format: 'zip' }, { zoneName: 'Zona 12', range: { from: '2026-09-22T12:24:00.000Z', to: '2026-09-23T12:00:00.000Z' } }),
    ).toBe('Zona-12-2026-09-22_1924_to_2026-09-23_1900.zip')
  })

  it('uses the WIB date after 17:00 WIB, where UTC is still the previous day', async () => {
    const { fileNameFor } = await import('../services/export.service')
    // 18:00 UTC on the 22nd is 01:00 WIB on the 23rd.
    expect(
      fileNameFor({ format: 'webm' }, { zoneName: 'YOG', range: { from: '2026-09-22T18:00:00.000Z', to: '2026-09-23T02:00:00.000Z' } }),
    ).toBe('YOG-2026-09-23_0100-0900.webm')
  })
})
