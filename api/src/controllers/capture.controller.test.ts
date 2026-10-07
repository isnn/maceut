import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../lib/drizzle-client', () => ({ checkDb: vi.fn(), closeDb: vi.fn(), db: {}, pool: {} }))
vi.mock('../lib/rabbitmq-client', () => ({
  checkQueue: vi.fn(),
  closeQueue: vi.fn(),
  getChannel: vi.fn(),
  publishCaptureJob: vi.fn(),
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
vi.mock('../repositories/capture.repository', () => ({ findById: vi.fn(), recentForUser: vi.fn(), listForCsv: vi.fn() }))
vi.mock('../lib/r2-client', () => ({
  getPresignedUrl: vi.fn(async (path: string) => `https://r2.example/${path}`),
  thumbnailPath: (p: string) => p.replace(/\.png$/, '.thumb.jpg'),
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
import * as r2 from '../lib/r2-client'
import { auth } from '../lib/auth'

const USER_ID = 'user_01'
const ZONE_ID = '3f8a1c2e-1111-4111-8111-111111111111'
const CAPTURE_ID = 'aaaaaaaa-3333-4333-8333-333333333333'

function signedIn() {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER_ID }, session: { id: 's' } } as never)
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan: 'standard' } as never)
}

function captureRow(over: Record<string, unknown> = {}) {
  return {
    id: CAPTURE_ID,
    userId: USER_ID,
    zoneId: ZONE_ID,
    status: 'done',
    // 00:30 UTC is 07:30 WIB — the name must carry the clock printed on the image.
    capturedAt: new Date('2026-09-27T00:30:00Z'),
    filePath: `captures/${USER_ID}/2026/09/${CAPTURE_ID}.png`,
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE_ID, name: 'Jl. Sudirman' } as never)
})

describe('GET /captures/:id/image', () => {
  it('returns a signed link named after the zone and the WIB time', async () => {
    signedIn()
    vi.mocked(captureRepo.findById).mockResolvedValue(captureRow())

    const res = await request(app).get(`/captures/${CAPTURE_ID}/image`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      url: `https://r2.example/captures/${USER_ID}/2026/09/${CAPTURE_ID}.png`,
      fileName: 'Jl-Sudirman-2026-09-27_0730.png',
      expiresInSeconds: 300,
    })
    expect(r2.getPresignedUrl).toHaveBeenCalledWith(
      `captures/${USER_ID}/2026/09/${CAPTURE_ID}.png`,
      300,
      'Jl-Sudirman-2026-09-27_0730.png',
    )
  })

  it('404s while the capture has no image yet', async () => {
    signedIn()
    vi.mocked(captureRepo.findById).mockResolvedValue(captureRow({ filePath: null }))

    const res = await request(app).get(`/captures/${CAPTURE_ID}/image`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(r2.getPresignedUrl).not.toHaveBeenCalled()
  })

  it("refuses another account's capture", async () => {
    signedIn()
    vi.mocked(captureRepo.findById).mockResolvedValue(captureRow({ userId: 'someone_else' }))

    const res = await request(app).get(`/captures/${CAPTURE_ID}/image`)

    expect(res.status).toBe(403)
    expect(r2.getPresignedUrl).not.toHaveBeenCalled()
  })

  it('404s for an unknown capture', async () => {
    signedIn()
    vi.mocked(captureRepo.findById).mockResolvedValue(undefined)

    const res = await request(app).get(`/captures/${CAPTURE_ID}/image`)
    expect(res.status).toBe(404)
  })

  it('requires a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)

    const res = await request(app).get(`/captures/${CAPTURE_ID}/image`)
    expect(res.status).toBe(401)
  })

  it('rejects an id that is not a uuid', async () => {
    signedIn()
    const res = await request(app).get('/captures/not-a-uuid/image')
    expect(res.status).toBe(422)
  })
})

describe('GET /captures (dashboard strip)', () => {
  it('gives collected captures with an image a signed thumbnail link, and others none', async () => {
    signedIn()
    const base = { userId: USER_ID, zoneId: ZONE_ID, zoneName: 'Sudirman', trigger: 'scheduled', roadClass: 'semua', roadsCount: 10, jamFactorAvg: '3.20', fileSize: 1, styleUsed: null, error: null, scheduledFor: null, scheduleId: null, capturedAt: new Date('2026-09-29T01:00:00Z'), createdAt: new Date() }
    vi.mocked(captureRepo.recentForUser).mockResolvedValue([
      { ...base, id: 'a', status: 'done', filePath: 'captures/u/2026/09/a.png' },
      { ...base, id: 'b', status: 'done', filePath: null },
      { ...base, id: 'c', status: 'failed', filePath: null },
    ] as never)

    const res = await request(app).get('/captures?limit=3')

    expect(res.status).toBe(200)
    expect(res.body.data.map((c: { thumbnailUrl: string | null }) => c.thumbnailUrl)).toEqual([
      'https://r2.example/captures/u/2026/09/a.thumb.jpg',
      null,
      null,
    ])
  })
})

describe('GET /zones/:id/captures.csv (FE-30)', () => {
  const csvRow = (over: Record<string, unknown> = {}) => ({
    capturedAt: new Date('2026-09-27T00:30:00Z'),
    status: 'done',
    trigger: 'scheduled',
    windowName: 'Rush, "east"',
    roadClass: 'nasional',
    roadsCount: 1043,
    jamFactorAvg: '3.25',
    error: null,
    ...over,
  })

  beforeEach(() => {
    vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE_ID, userId: USER_ID, name: 'Jl. Sudirman' } as never)
    vi.mocked(captureRepo.listForCsv).mockResolvedValue([csvRow()])
  })

  it('requires a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    expect((await request(app).get(`/zones/${ZONE_ID}/captures.csv`)).status).toBe(401)
  })

  it('refuses another account’s zone', async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE_ID, userId: 'someone-else', name: 'X' } as never)
    const res = await request(app).get(`/zones/${ZONE_ID}/captures.csv`)
    expect(res.status).toBe(403)
    expect(captureRepo.listForCsv).not.toHaveBeenCalled()
  })

  it('downloads one row per capture, in WIB, with fields escaped', async () => {
    signedIn()
    const res = await request(app).get(`/zones/${ZONE_ID}/captures.csv`)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/^text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="maceut-jl-sudirman-captures-\d{4}-\d{2}-\d{2}\.csv"/)
    const lines = res.text.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('captured_at_wib,status,trigger,window,road_class,roads,avg_jam_factor,error')
    expect(lines[1]).toBe('2026-09-27 07:30,done,scheduled,"Rush, ""east""",nasional,1043,3.25,')
  })

  it('reaches back as far as the plan’s history (BR-007)', async () => {
    signedIn() // standard → 90 days
    const res = await request(app).get(`/zones/${ZONE_ID}/captures.csv`)
    expect(res.headers['x-export-range']).toBe('last-90-days')
    const since = vi.mocked(captureRepo.listForCsv).mock.calls[0]![1] as Date
    expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(90)

    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan: 'premium' } as never)
    const all = await request(app).get(`/zones/${ZONE_ID}/captures.csv`)
    expect(all.headers['x-export-range']).toBe('all')
    expect(vi.mocked(captureRepo.listForCsv).mock.calls[1]![1]).toBeNull()

    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan: 'free' } as never)
    const free = await request(app).get(`/zones/${ZONE_ID}/captures.csv`)
    expect(free.headers['x-export-range']).toBe('last-7-days')
  })

  it('takes a shorter range, and refuses one past the plan (FE-32)', async () => {
    signedIn() // standard → 90 days
    const res = await request(app).get(`/zones/${ZONE_ID}/captures.csv?days=7`)
    expect(res.status).toBe(200)
    expect(res.headers['x-export-range']).toBe('last-7-days')

    const all = await request(app).get(`/zones/${ZONE_ID}/captures.csv?days=all`)
    expect(all.status).toBe(403)
    expect(all.body.error).toMatchObject({ code: 'HISTORY_LIMIT_EXCEEDED', details: { historyDays: 90 } })

    expect((await request(app).get(`/zones/${ZONE_ID}/captures.csv?days=5`)).status).toBe(422)
  })
})
