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
vi.mock('../repositories/user.repository', () => ({
  findById: vi.fn(),
  findByIdWithPlan: vi.fn(),
  findByEmail: vi.fn(),
  ensurePlan: vi.fn(),
  setPlan: vi.fn(),
  updateUser: vi.fn(),
  listWithPlans: vi.fn(),
  countInternal: vi.fn(),
}))

// The real client is left in place for URL building, length measurement and GeoJSON
// mapping; only the network call is replaced, so the tests still exercise our code.
// `vi.hoisted` because vi.mock is lifted above every other statement in the file.
const { getTrafficFlow } = vi.hoisted(() => ({ getTrafficFlow: vi.fn() }))
vi.mock('../lib/here-traffic-client', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getTrafficFlow }
})

import { app } from '../app'
import * as userRepo from '../repositories/user.repository'
import { auth } from '../lib/auth'
import type { Plan } from '../types/plan'

const USER_ID = 'user_01'
const BBOX = '110.33,-7.82,110.43,-7.74'

/** A collection of `n` one-kilometre-ish segments, so length is non-zero. */
function collection(n: number) {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: n }, () => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[110, -7], [110, -7.009]] },
      properties: { trafficState: 'normal', color: '#4CAF50', jamFactor: 1 },
    })),
  }
}

function signedInAs(plan: Plan) {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER_ID }, session: { id: 's' } } as never)
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  signedInAs('free')
  // One call per tier, widest last, so a wrong ordering shows up as wrong numbers.
  getTrafficFlow
    .mockResolvedValueOnce(collection(1043))
    .mockResolvedValueOnce(collection(4777))
    .mockResolvedValueOnce(collection(8684))
})

describe('GET /traffic/road-class-counts', () => {
  it('requires a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)

    const res = await request(app).get(`/traffic/road-class-counts?bbox=${BBOX}`)

    expect(res.status).toBe(401)
  })

  it('returns a count for every tier, including ones above the caller’s plan', async () => {
    // This is the whole point of the endpoint: a Free account must be able to see that
    // Premium would cover 8,684 roads here rather than 1,043. Counting is not seeing —
    // no geometry for the locked tiers is returned, only the number. Withholding it
    // would leave the upgrade prompt with nothing to say.
    const res = await request(app).get(`/traffic/road-class-counts?bbox=${BBOX}`)

    expect(res.status).toBe(200)
    expect(res.body.data.counts.nasional.roads).toBe(1043)
    expect(res.body.data.counts.nasional_provinsi.roads).toBe(4777)
    expect(res.body.data.counts.semua.roads).toBe(8684)
  })

  it('reports the plan’s ceiling so the UI can lock the rest', async () => {
    const res = await request(app).get(`/traffic/road-class-counts?bbox=${BBOX}`)

    expect(res.body.data.maxRoadClass).toBe('nasional')
  })

  it('moves that ceiling with the plan', async () => {
    signedInAs('premium')

    const res = await request(app).get(`/traffic/road-class-counts?bbox=${BBOX}`)

    expect(res.body.data.maxRoadClass).toBe('semua')
  })

  it('asks HERE once per tier, with widening class filters', async () => {
    // There is no way to do this in one request: the flow response carries no
    // functional class, so the split only exists by asking three questions.
    await request(app).get(`/traffic/road-class-counts?bbox=${BBOX}`)

    expect(getTrafficFlow).toHaveBeenCalledTimes(3)
    const sent = getTrafficFlow.mock.calls.map((c) => c[1].functionalClasses)
    expect(sent).toEqual([[1, 2], [1, 2, 3], [1, 2, 3, 4, 5]])
  })

  it('measures length as well as count', async () => {
    const res = await request(app).get(`/traffic/road-class-counts?bbox=${BBOX}`)

    // 1043 segments of ~1 km. The exact figure is pinned by the client's own tests;
    // here it only has to be a real measurement rather than a placeholder.
    expect(res.body.data.counts.nasional.lengthKm).toBeGreaterThan(0)
  })

  it('rejects a malformed bbox before spending a HERE request', async () => {
    const res = await request(app).get('/traffic/road-class-counts?bbox=not-a-bbox')

    expect(res.status).toBe(422)
    expect(getTrafficFlow).not.toHaveBeenCalled()
  })

  it('requires bbox at all', async () => {
    const res = await request(app).get('/traffic/road-class-counts')

    expect(res.status).toBe(422)
  })

  it('surfaces a HERE failure as 502, not 500', async () => {
    getTrafficFlow.mockReset()
    const { UpstreamError } = await import('../errors')
    getTrafficFlow.mockRejectedValue(new UpstreamError('HERE', 'quota exhausted'))

    const res = await request(app).get(`/traffic/road-class-counts?bbox=${BBOX}`)

    // A third party being down is not our bug, and the screens branch on the code.
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('UPSTREAM_ERROR')
  })
})
