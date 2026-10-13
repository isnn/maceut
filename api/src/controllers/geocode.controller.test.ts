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
vi.mock('../services/geocode.service', () => ({ searchPlaces: vi.fn() }))

import { app } from '../app'
import { auth } from '../lib/auth'
import * as userRepo from '../repositories/user.repository'
import * as geocode from '../services/geocode.service'

beforeEach(() => vi.clearAllMocks())

function signedIn() {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' }, session: { id: 's' } } as never)
  vi.mocked(userRepo.findById).mockResolvedValue({ id: 'u1', email: 'budi@example.com', role: 'user' } as never)
}

describe('GET /geocode', () => {
  it('needs a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    expect((await request(app).get('/geocode?q=Malioboro')).status).toBe(401)
  })

  it('returns the places found', async () => {
    signedIn()
    vi.mocked(geocode.searchPlaces).mockResolvedValue({ provider: 'here', results: [] })
    const res = await request(app).get('/geocode?q=Malioboro')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: { provider: 'here', results: [] } })
    expect(geocode.searchPlaces).toHaveBeenCalledWith('Malioboro')
  })

  it('refuses a query shorter than 2 letters', async () => {
    signedIn()
    const res = await request(app).get('/geocode?q=a')
    expect(res.status).toBe(422)
    expect(geocode.searchPlaces).not.toHaveBeenCalled()
  })
})
