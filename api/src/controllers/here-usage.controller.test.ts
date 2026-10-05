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
vi.mock('../repositories/user.repository', () => ({ findById: vi.fn(), findByIdWithPlan: vi.fn() }))
vi.mock('../repositories/here-usage.repository', () => ({
  HERE_SOURCES: ['capture', 'preview', 'road_counts', 'zone_stats'],
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  increment: vi.fn(),
  totalsOn: vi.fn(),
  totalsSince: vi.fn(),
  rowsSince: vi.fn(),
}))

import { app } from '../app'
import * as userRepo from '../repositories/user.repository'
import * as usageRepo from '../repositories/here-usage.repository'
import { auth } from '../lib/auth'
import { wibDay } from '../services/here-usage.service'

const STAFF = 'staff_01'
const zero = { requests: 0, failed: 0, refused: 0 }

function signedIn(role: 'internal' | 'user') {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: STAFF }, session: { id: 's' } } as never)
  // A customer needs a customer's address: ops@maceut.id is staff by INTERNAL_EMAILS,
  // whatever role is stored — which the first version of this test tripped over.
  const email = role === 'internal' ? 'ops@maceut.id' : 'budi@example.com'
  vi.mocked(userRepo.findById).mockResolvedValue({ id: STAFF, email, role } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(usageRepo.totalsOn).mockResolvedValue({ ...zero, requests: 90 })
  vi.mocked(usageRepo.totalsSince).mockResolvedValue({ ...zero, requests: 900 })
  vi.mocked(usageRepo.rowsSince).mockResolvedValue([
    { day: wibDay(new Date()), source: 'capture', requests: 80, failed: 1, refused: 0 },
    { day: wibDay(new Date()), source: 'preview', requests: 10, failed: 0, refused: 2 },
  ] as never)
  vi.mocked(usageRepo.getSetting).mockResolvedValue({
    value: { dailyLimit: 100, monthlyLimit: 5000, costPer1000: 2 },
    updatedAt: new Date('2026-09-28T00:00:00Z'),
    updatedBy: STAFF,
  } as never)
})

describe('auth', () => {
  it('is closed without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    expect((await request(app).get('/internal/here-usage')).status).toBe(401)
    expect((await request(app).put('/internal/here-usage').send({})).status).toBe(401)
  })

  it('is closed to customers — HERE usage is never shown to a normal user', async () => {
    signedIn('user')
    expect((await request(app).get('/internal/here-usage')).status).toBe(403)
    expect((await request(app).put('/internal/here-usage').send({ dailyLimit: 1, monthlyLimit: null, costPer1000: null })).status).toBe(403)
  })
})

describe('GET /internal/here-usage', () => {
  it('summarises today, the month, the caps and the last 30 days', async () => {
    signedIn('internal')
    const res = await request(app).get('/internal/here-usage')

    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.today.requests).toBe(90)
    expect(d.dailyUsed).toBeCloseTo(0.9)
    expect(d.monthlyUsed).toBeCloseTo(0.18)
    expect(d.status).toBe('warning') // 90% of the daily cap
    expect(d.estimatedMonthCost).toBe(1.8) // 900 requests × $2 / 1000
    expect(d.days).toHaveLength(30)
    const last = d.days[29]
    expect(last.total).toBe(90)
    expect(last.bySource).toMatchObject({ capture: 80, preview: 10, road_counts: 0, zone_stats: 0 })
    expect(last.refused).toBe(2)
  })

  it('reports blocked once a cap is reached', async () => {
    signedIn('internal')
    vi.mocked(usageRepo.totalsOn).mockResolvedValue({ ...zero, requests: 100 })
    const res = await request(app).get('/internal/here-usage')
    expect(res.body.data.status).toBe('blocked')
  })
})

describe('PUT /internal/here-usage', () => {
  it('saves the budget with who set it', async () => {
    signedIn('internal')
    const body = { dailyLimit: 200, monthlyLimit: null, costPer1000: 1.5 }
    const res = await request(app).put('/internal/here-usage').send(body)

    expect(res.status).toBe(200)
    // alertEmail is optional for older clients and saved as null.
    expect(usageRepo.setSetting).toHaveBeenCalledWith('here_budget', { ...body, alertEmail: null }, STAFF)
  })

  it('saves the alert address, normalised', async () => {
    signedIn('internal')
    const res = await request(app)
      .put('/internal/here-usage')
      .send({ dailyLimit: 200, monthlyLimit: null, costPer1000: null, alertEmail: ' Ops@Maceut.id ' })
    expect(res.status).toBe(200)
    expect(usageRepo.setSetting).toHaveBeenCalledWith('here_budget', expect.objectContaining({ alertEmail: 'ops@maceut.id' }), STAFF)
  })

  it('rejects an alert address that is not an email', async () => {
    signedIn('internal')
    const res = await request(app)
      .put('/internal/here-usage')
      .send({ dailyLimit: 200, monthlyLimit: null, costPer1000: null, alertEmail: 'ops at maceut' })
    expect(res.status).toBe(422)
  })

  it('rejects a zero or negative cap', async () => {
    signedIn('internal')
    const res = await request(app).put('/internal/here-usage').send({ dailyLimit: 0, monthlyLimit: null, costPer1000: null })
    expect(res.status).toBe(422)
    expect(usageRepo.setSetting).not.toHaveBeenCalled()
  })
})
