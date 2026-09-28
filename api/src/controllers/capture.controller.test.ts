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
vi.mock('../repositories/capture.repository', () => ({ findById: vi.fn() }))
vi.mock('../lib/r2-client', () => ({
  getPresignedUrl: vi.fn(async () => 'https://r2.example/signed'),
  remove: vi.fn(),
}))

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
      url: 'https://r2.example/signed',
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
