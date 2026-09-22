import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../lib/drizzle-client', () => ({ checkDb: vi.fn(), closeDb: vi.fn(), db: {}, pool: {} }))
vi.mock('../lib/rabbitmq-client', () => ({ checkQueue: vi.fn(), closeQueue: vi.fn(), getChannel: vi.fn() }))

// Better Auth is stubbed at its API boundary: these tests are about our guards, not
// about whether Better Auth can validate a cookie. toNodeHandler still has to return
// a real handler, since app.ts mounts it at import time.
vi.mock('../lib/auth', () => ({
  auth: { api: { getSession: vi.fn() }, handler: vi.fn() },
}))
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
  updateUser: vi.fn(),
  setPlan: vi.fn(),
  ensurePlan: vi.fn(),
  listWithPlans: vi.fn(),
  countInternal: vi.fn(),
}))
// changePlan now runs the grandfather-and-block pass (ADR-020), which reads the
// account's zones and schedules to work out what would exceed the new plan.
// The directory and the overview also count zones and windows per account, in one
// grouped query each rather than one per listed row.
vi.mock('../repositories/zone.repository', () => ({
  findByUserId: vi.fn(() => []),
  update: vi.fn(),
  countsByUser: vi.fn(async () => new Map()),
  countAllCollecting: vi.fn(async () => 0),
}))
vi.mock('../repositories/schedule.repository', () => ({
  findByUserId: vi.fn(() => []),
  update: vi.fn(),
  countsByUser: vi.fn(async () => new Map()),
  countAllActive: vi.fn(async () => 0),
}))
vi.mock('../repositories/capture.repository', () => ({
  countsToday: vi.fn(async () => new Map()),
  countAllToday: vi.fn(async () => 0),
}))
vi.mock('../lib/internal-access', () => ({
  isInternalByConfig: vi.fn(() => false),
  resolveRole: vi.fn((_email: string, stored: string) => stored),
  configuredInternalEmails: vi.fn(() => []),
}))

import { app } from '../app'
import * as userRepo from '../repositories/user.repository'
import * as internalAccess from '../lib/internal-access'
import { auth } from '../lib/auth'

const STAFF_ID = 'staff_01'
const TARGET_ID = 'user_02'

function row(over: Partial<userRepo.UserWithPlan> = {}): userRepo.UserWithPlan {
  return {
    id: TARGET_ID,
    email: 'budi@maceut.id',
    name: 'Budi Santoso',
    emailVerified: true,
    image: null,
    role: 'user',
    onboardingDone: true,
    createdAt: new Date('2026-09-18T00:00:00Z'),
    updatedAt: new Date('2026-09-18T00:00:00Z'),
    plan: 'free',
    ...over,
  }
}

/** Better Auth reports a signed-in session for this id. */
function signedInAs(id: string) {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id }, session: { id: 'sess_1' } } as never)
}

function staffLookups() {
  vi.mocked(userRepo.findById).mockImplementation(async (id: string) =>
    id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal' }) : row(),
  )
  vi.mocked(userRepo.findByIdWithPlan).mockImplementation(async (id: string) =>
    id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal' }) : row(),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(internalAccess.isInternalByConfig).mockReturnValue(false)
  vi.mocked(internalAccess.resolveRole).mockImplementation((_e, stored) => stored)
  vi.mocked(internalAccess.configuredInternalEmails).mockReturnValue([])
})

describe('access control', () => {
  it('returns 401 with no session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)

    const res = await request(app).get('/internal/users')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('treats a malformed cookie as signed out, not as a server error', async () => {
    vi.mocked(auth.api.getSession).mockRejectedValue(new Error('invalid session token'))

    const res = await request(app).get('/internal/users')

    expect(res.status).toBe(401)
  })

  it('returns 403 for a signed-in non-staff account', async () => {
    signedInAs(STAFF_ID)
    vi.mocked(userRepo.findById).mockResolvedValue(row({ id: STAFF_ID, role: 'user' }))

    const res = await request(app).get('/internal/users')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('guards every /internal route, including ones added later', async () => {
    signedInAs(STAFF_ID)
    vi.mocked(userRepo.findById).mockResolvedValue(row({ id: STAFF_ID, role: 'user' }))

    for (const path of ['/internal/users', '/internal/stats', `/internal/users/${TARGET_ID}`]) {
      const res = await request(app).get(path)
      expect(res.status, `${path} should be staff-only`).toBe(403)
    }
  })

  it('applies a demotion to the existing session, not just to new ones', async () => {
    signedInAs(STAFF_ID)
    // The role is re-resolved per request, so an account demoted a moment ago loses
    // access immediately rather than keeping it until the session expires.
    vi.mocked(userRepo.findById).mockResolvedValue(row({ id: STAFF_ID, role: 'internal' }))
    vi.mocked(internalAccess.resolveRole).mockReturnValue('user')

    const res = await request(app).get('/internal/users')

    expect(res.status).toBe(403)
  })

  it('keeps errors in this API envelope, not Better Auth shapes', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)

    const res = await request(app).get('/internal/users')

    expect(res.body).toMatchObject({ success: false, error: { code: expect.any(String) } })
  })
})

describe('GET /internal/users', () => {
  it('returns a paginated list without password material', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(userRepo.listWithPlans).mockResolvedValue({ rows: [row()], total: 1 })

    const res = await request(app).get('/internal/users')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta).toMatchObject({ total: 1, page: 1, limit: 20, total_pages: 1 })
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[ab]\$/i)
  })

  it("maps Better Auth's `name` onto the frontend's `fullName`", async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(userRepo.listWithPlans).mockResolvedValue({ rows: [row({ name: 'Siti Aminah' })], total: 1 })

    const res = await request(app).get('/internal/users')

    expect(res.body.data[0].fullName).toBe('Siti Aminah')
    expect(res.body.data[0]).not.toHaveProperty('name')
  })

  it('passes search and filters through to the query', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(userRepo.listWithPlans).mockResolvedValue({ rows: [], total: 0 })

    await request(app).get('/internal/users?search=dishub&plan=premium&role=user&page=2&limit=5')

    expect(userRepo.listWithPlans).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'dishub', plan: 'premium', role: 'user', limit: 5, offset: 5 }),
    )
  })

  it('hands the config list to the query so the role filter matches what rows display', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(internalAccess.configuredInternalEmails).mockReturnValue(['ops@maceut.id'])
    vi.mocked(userRepo.listWithPlans).mockResolvedValue({ rows: [], total: 0 })

    await request(app).get('/internal/users?role=internal')

    // Filtering on the stored column alone made the list contradict itself: an
    // address newly added to INTERNAL_EMAILS rendered as `internal` but was returned
    // by ?role=user and missing from ?role=internal, until that person next signed in.
    expect(userRepo.listWithPlans).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'internal', internalEmails: ['ops@maceut.id'] }),
    )
  })

  it('caps limit so one request cannot ask for every row', async () => {
    signedInAs(STAFF_ID)
    staffLookups()

    const res = await request(app).get('/internal/users?limit=100000')

    expect(res.status).toBe(422)
    expect(res.body.error.details.limit).toBeDefined()
  })
})

describe('PATCH /internal/users/:id/plan', () => {
  it('changes the plan', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(userRepo.setPlan).mockResolvedValue(undefined)
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ plan: 'premium' }))

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/plan`).send({ plan: 'premium' })

    expect(res.status).toBe(200)
    // The response now carries what the change paused alongside the user, so the
    // confirmation dialog and the outcome report the same shape (ADR-020).
    expect(res.body.data.user.plan).toBe('premium')
    expect(res.body.data.impact.clean).toBe(true)
    expect(userRepo.setPlan).toHaveBeenCalledWith(TARGET_ID, 'premium')
  })

  it('rejects an unknown plan', async () => {
    signedInAs(STAFF_ID)
    staffLookups()

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/plan`).send({ plan: 'enterprise' })

    expect(res.status).toBe(422)
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })

  it('returns 404 for an account that does not exist', async () => {
    signedInAs(STAFF_ID)
    vi.mocked(userRepo.findById).mockImplementation(async (id: string) =>
      id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal' }) : undefined,
    )

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/plan`).send({ plan: 'free' })

    expect(res.status).toBe(404)
  })
})

describe('PATCH /internal/users/:id/role', () => {
  it('promotes an ordinary account', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(userRepo.updateUser).mockResolvedValue(undefined)
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ role: 'internal' }))

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/role`).send({ role: 'internal' })

    expect(res.status).toBe(200)
    expect(userRepo.updateUser).toHaveBeenCalledWith(TARGET_ID, { role: 'internal' })
  })

  it('refuses to let you change your own role', async () => {
    signedInAs(STAFF_ID)
    staffLookups()

    const res = await request(app).patch(`/internal/users/${STAFF_ID}/role`).send({ role: 'user' })

    expect(res.status).toBe(403)
    expect(userRepo.updateUser).not.toHaveBeenCalled()
  })

  it('refuses to demote an account whose role comes from config (BR-027)', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    // Demoting here would be undone at their next sign-in, so the UI would be
    // reporting a change that does not hold.
    vi.mocked(internalAccess.isInternalByConfig).mockReturnValue(true)

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/role`).send({ role: 'user' })

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/INTERNAL_EMAILS/)
    expect(userRepo.updateUser).not.toHaveBeenCalled()
  })

  it('refuses to demote the last internal account', async () => {
    signedInAs(STAFF_ID)
    vi.mocked(userRepo.findById).mockImplementation(async (id: string) =>
      id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal' }) : row({ role: 'internal' }),
    )
    vi.mocked(userRepo.countInternal).mockResolvedValue(1)

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/role`).send({ role: 'user' })

    // Losing every internal account is unrecoverable through the API — the only fix
    // would be editing the database by hand.
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/satu-satunya/)
    expect(userRepo.updateUser).not.toHaveBeenCalled()
  })

  it('allows demoting one of several internal accounts', async () => {
    signedInAs(STAFF_ID)
    vi.mocked(userRepo.findById).mockImplementation(async (id: string) =>
      id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal' }) : row({ role: 'internal' }),
    )
    vi.mocked(userRepo.countInternal).mockResolvedValue(3)
    vi.mocked(userRepo.updateUser).mockResolvedValue(undefined)
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ role: 'user' }))

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/role`).send({ role: 'user' })

    expect(res.status).toBe(200)
    expect(userRepo.updateUser).toHaveBeenCalledWith(TARGET_ID, { role: 'user' })
  })
})

describe('GET /internal/stats', () => {
  it('aggregates accounts by plan', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(userRepo.listWithPlans).mockResolvedValue({
      rows: [row({ plan: 'free' }), row({ plan: 'premium' }), row({ plan: 'premium' })],
      total: 3,
    })
    vi.mocked(userRepo.countInternal).mockResolvedValue(2)

    const res = await request(app).get('/internal/stats')

    expect(res.status).toBe(200)
    expect(res.body.data.totalUsers).toBe(3)
    expect(res.body.data.internalUsers).toBe(2)
    expect(res.body.data.planMix).toEqual({ free: 1, standard: 0, premium: 2 })
  })
})
