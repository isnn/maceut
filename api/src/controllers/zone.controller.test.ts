import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../lib/drizzle-client', () => ({ checkDb: vi.fn(), closeDb: vi.fn(), db: {}, pool: {} }))
vi.mock('../lib/rabbitmq-client', () => ({ checkQueue: vi.fn(), closeQueue: vi.fn(), getChannel: vi.fn() }))
vi.mock('../lib/auth', () => ({ auth: { api: { getSession: vi.fn() }, handler: vi.fn() } }))
vi.mock('better-auth/node', () => ({
  toNodeHandler: () => (_req: unknown, res: { statusCode: number; end: (s: string) => void }) => {
    res.statusCode = 404
    res.end('')
  },
  fromNodeHeaders: (h: unknown) => h,
}))
// Zones report their cadence from the windows pointing at them, so the zone endpoints
// now read this too.
vi.mock('../repositories/schedule.repository', () => ({
  cadenceByZone: vi.fn(async () => new Map()),
}))
vi.mock('../repositories/user.repository', () => ({
  findById: vi.fn(),
  findByIdWithPlan: vi.fn(),
  findByEmail: vi.fn(),
  updateUser: vi.fn(),
  setPlan: vi.fn(),
  ensurePlan: vi.fn(),
  listWithPlans: vi.fn(),
  countInternal: vi.fn(),
}))
vi.mock('../repositories/zone.repository', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByUserId: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
  countByUserId: vi.fn(),
  existsByNameAndUserId: vi.fn(),
  bboxOf: vi.fn(),
}))
// HERE is not configured in tests, so road stats derive to null without a network call.
vi.mock('../config/env', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isHereConfigured: () => false }
})

import { app } from '../app'
import * as zoneRepo from '../repositories/zone.repository'
import * as userRepo from '../repositories/user.repository'
import { auth } from '../lib/auth'
import type { ZoneRecord } from '../repositories/zone.repository'
import type { Plan } from '../types/plan'

const USER_ID = 'user_01'
const ZONE_ID = '3f8a1c2e-1111-4111-8111-111111111111'

const SQUARE: number[][][] = [
  [
    [110.36, -7.8],
    [110.37, -7.8],
    [110.37, -7.79],
    [110.36, -7.79],
    [110.36, -7.8],
  ],
]

function zone(over: Partial<ZoneRecord> = {}): ZoneRecord {
  return {
    id: ZONE_ID,
    userId: USER_ID,
    name: 'Zona Malioboro',
    geometry: { type: 'Polygon', coordinates: SQUARE },
    roadClass: 'nasional',
    status: 'collecting',
    areaKm2: 1.23,
    roadsCount: null,
    lengthKm: null,
    createdAt: new Date('2026-09-19T00:00:00Z'),
    updatedAt: new Date('2026-09-19T00:00:00Z'),
    ...over,
  }
}

function signedIn(plan: Plan = 'standard') {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER_ID }, session: { id: 's' } } as never)
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan } as never)
}

const body = { name: 'Zona Malioboro', geometry: { type: 'Polygon', coordinates: SQUARE }, roadClass: 'nasional' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(zoneRepo.existsByNameAndUserId).mockResolvedValue(false)
  vi.mocked(zoneRepo.countByUserId).mockResolvedValue(0)
})

describe('auth', () => {
  it('returns 401 for every zone route without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)

    for (const [method, path] of [
      ['get', '/zones'],
      ['post', '/zones'],
      ['get', `/zones/${ZONE_ID}`],
      ['patch', `/zones/${ZONE_ID}`],
      ['delete', `/zones/${ZONE_ID}`],
      ['get', '/traffic/preview?bbox=110.36,-7.8,110.37,-7.79'],
    ] as const) {
      const res = await request(app)[method](path)
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })
})

describe('POST /zones', () => {
  it('creates a zone and returns 201', async () => {
    signedIn()
    vi.mocked(zoneRepo.create).mockResolvedValue(zone())

    const res = await request(app).post('/zones').send(body)

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Zona Malioboro')
    expect(res.body.data.areaKm2).toBe(1.23)
  })

  it('returns 422 ZONE_NAME_TAKEN for a duplicate name (BR-015)', async () => {
    signedIn()
    vi.mocked(zoneRepo.existsByNameAndUserId).mockResolvedValue(true)

    const res = await request(app).post('/zones').send(body)

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ZONE_NAME_TAKEN')
    expect(zoneRepo.create).not.toHaveBeenCalled()
  })

  it('returns 403 ROAD_CLASS_NOT_ALLOWED above the plan (BR-021)', async () => {
    signedIn('free') // free caps at `nasional`

    const res = await request(app).post('/zones').send({ ...body, roadClass: 'semua' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ROAD_CLASS_NOT_ALLOWED')
    expect(res.body.error.details).toMatchObject({ requested: 'semua', maxAllowed: 'nasional' })
    expect(zoneRepo.create).not.toHaveBeenCalled()
  })

  it('refuses once the plan zone limit is reached', async () => {
    signedIn('free') // free allows 1 zone
    vi.mocked(zoneRepo.countByUserId).mockResolvedValue(1)

    const res = await request(app).post('/zones').send(body)

    expect(res.status).toBe(422)
    expect(res.body.error.details).toMatchObject({ limit: 1, plan: 'free' })
    expect(zoneRepo.create).not.toHaveBeenCalled()
  })

  it('rejects an unclosed polygon (BR-013)', async () => {
    signedIn()
    const open = [[[110.36, -7.8], [110.37, -7.8], [110.37, -7.79], [110.36, -7.79]]]

    const res = await request(app).post('/zones').send({ ...body, geometry: { type: 'Polygon', coordinates: open } })

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/tertutup/)
  })

  it('rejects a ring with too few points', async () => {
    signedIn()
    const tiny = [[[110.36, -7.8], [110.37, -7.8], [110.36, -7.8]]]

    const res = await request(app).post('/zones').send({ ...body, geometry: { type: 'Polygon', coordinates: tiny } })

    expect(res.status).toBe(422)
  })

  it('rejects coordinates outside WGS84 range', async () => {
    signedIn()
    const bad = [[[200, -7.8], [110.37, -7.8], [110.37, -7.79], [200, -7.8]]]

    const res = await request(app).post('/zones').send({ ...body, geometry: { type: 'Polygon', coordinates: bad } })

    expect(res.status).toBe(422)
  })

  it('stores null road stats when HERE is unconfigured, not zero', async () => {
    signedIn()
    vi.mocked(zoneRepo.create).mockResolvedValue(zone())

    await request(app).post('/zones').send(body)

    // Zero would claim the zone matched no roads. Null says we do not know yet.
    expect(zoneRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ roadsCount: null, lengthKm: null }),
    )
  })
})

describe('GET /zones', () => {
  it('lists only this user’s zones', async () => {
    signedIn()
    vi.mocked(zoneRepo.findByUserId).mockResolvedValue([zone()])

    const res = await request(app).get('/zones')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(zoneRepo.findByUserId).toHaveBeenCalledWith(USER_ID)
  })
})

describe('GET /zones/:id', () => {
  it('returns the zone', async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue(zone())

    const res = await request(app).get(`/zones/${ZONE_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(ZONE_ID)
  })

  it('returns 404 for a zone that does not exist', async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue(undefined)

    const res = await request(app).get(`/zones/${ZONE_ID}`)
    expect(res.status).toBe(404)
  })

  it("returns 403 for another user's zone", async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue(zone({ userId: 'someone_else' }))

    const res = await request(app).get(`/zones/${ZONE_ID}`)

    expect(res.status).toBe(403)
  })

  it('rejects a malformed id before touching the database', async () => {
    signedIn()
    const res = await request(app).get('/zones/not-a-uuid')

    expect(res.status).toBe(422)
    expect(zoneRepo.findById).not.toHaveBeenCalled()
  })
})

describe('PATCH /zones/:id', () => {
  beforeEach(() => vi.mocked(zoneRepo.findById).mockResolvedValue(zone()))

  it('renames a zone', async () => {
    signedIn()
    vi.mocked(zoneRepo.update).mockResolvedValue(zone({ name: 'Zona Tugu' }))

    const res = await request(app).patch(`/zones/${ZONE_ID}`).send({ name: 'Zona Tugu' })

    expect(res.status).toBe(200)
    expect(zoneRepo.update).toHaveBeenCalledWith(ZONE_ID, expect.objectContaining({ name: 'Zona Tugu' }))
  })

  it('allows saving a zone under its own current name', async () => {
    signedIn()
    // The self-exclusion in existsByNameAndUserId is what makes this work; without it
    // a rename collides with itself and every save fails.
    vi.mocked(zoneRepo.update).mockResolvedValue(zone())

    const res = await request(app).patch(`/zones/${ZONE_ID}`).send({ name: 'Zona Malioboro' })

    expect(res.status).toBe(200)
    expect(zoneRepo.existsByNameAndUserId).not.toHaveBeenCalled()
  })

  it('returns 422 when renaming onto another zone’s name', async () => {
    signedIn()
    vi.mocked(zoneRepo.existsByNameAndUserId).mockResolvedValue(true)

    const res = await request(app).patch(`/zones/${ZONE_ID}`).send({ name: 'Zona Tugu' })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ZONE_NAME_TAKEN')
    expect(zoneRepo.update).not.toHaveBeenCalled()
  })

  it('enforces BR-021 on edit, so editing is not a way around the plan', async () => {
    signedIn('free')

    const res = await request(app).patch(`/zones/${ZONE_ID}`).send({ roadClass: 'semua' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ROAD_CLASS_NOT_ALLOWED')
    expect(zoneRepo.update).not.toHaveBeenCalled()
  })

  it('re-derives road stats when the road class changes', async () => {
    signedIn('premium')
    vi.mocked(zoneRepo.update).mockResolvedValue(zone({ roadClass: 'semua' }))

    await request(app).patch(`/zones/${ZONE_ID}`).send({ roadClass: 'semua' })

    // Leaving them stale would have the zone claim to collect roads it no longer does.
    expect(zoneRepo.update).toHaveBeenCalledWith(
      ZONE_ID,
      expect.objectContaining({ roadClass: 'semua', roadsCount: null, lengthKm: null }),
    )
  })

  it('pauses and resumes', async () => {
    signedIn()
    vi.mocked(zoneRepo.update).mockResolvedValue(zone({ status: 'paused' }))

    const res = await request(app).patch(`/zones/${ZONE_ID}`).send({ status: 'paused' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('paused')
  })

  it('rejects an empty patch rather than silently doing nothing', async () => {
    signedIn()
    const res = await request(app).patch(`/zones/${ZONE_ID}`).send({})

    expect(res.status).toBe(422)
    expect(zoneRepo.update).not.toHaveBeenCalled()
  })

  it("refuses to edit another user's zone", async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue(zone({ userId: 'someone_else' }))

    const res = await request(app).patch(`/zones/${ZONE_ID}`).send({ name: 'Hijacked' })

    expect(res.status).toBe(403)
    expect(zoneRepo.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /zones/:id', () => {
  it('deletes the zone', async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue(zone())

    const res = await request(app).delete(`/zones/${ZONE_ID}`)

    expect(res.status).toBe(200)
    expect(zoneRepo.deleteById).toHaveBeenCalledWith(ZONE_ID)
  })

  it("refuses to delete another user's zone", async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue(zone({ userId: 'someone_else' }))

    const res = await request(app).delete(`/zones/${ZONE_ID}`)

    expect(res.status).toBe(403)
    expect(zoneRepo.deleteById).not.toHaveBeenCalled()
  })
})

describe('GET /traffic/preview', () => {
  it('returns 502 with a clear message when HERE is unconfigured', async () => {
    signedIn()

    const res = await request(app).get('/traffic/preview?bbox=110.36,-7.8,110.37,-7.79')

    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('UPSTREAM_ERROR')
    expect(res.body.error.message).toMatch(/HERE_API_KEY/)
  })

  it('rejects a malformed bbox', async () => {
    signedIn()
    const res = await request(app).get('/traffic/preview?bbox=not,a,bbox')

    expect(res.status).toBe(422)
  })

  it('rejects a bbox too large to bill or render', async () => {
    signedIn()
    const res = await request(app).get('/traffic/preview?bbox=100,-10,120,-5')

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/terlalu luas/)
  })

  it('requires bbox', async () => {
    signedIn()
    const res = await request(app).get('/traffic/preview')
    expect(res.status).toBe(422)
  })
})
