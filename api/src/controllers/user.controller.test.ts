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
  countSuperadmins: vi.fn(),
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
vi.mock('../services/usage.service', () => ({ getUsage: vi.fn() }))
vi.mock('../repositories/capture.repository', () => ({
  countsByZoneSince: vi.fn(async () => new Map()),
  countsToday: vi.fn(async () => new Map()),
  countAllToday: vi.fn(async () => 0),
}))
vi.mock('../lib/internal-access', () => {
  const isInternalByConfig = vi.fn((_email: string) => false)
  const resolveRole = vi.fn((_email: string, stored: string) => stored)
  // Same rules as the real module, built on the two mocks above (FE-34).
  const resolveStaffType = (email: string, role: string, stored: string | null) =>
    resolveRole(email, role) !== 'internal' ? null : isInternalByConfig(email) ? 'superadmin' : stored === 'superadmin' ? 'superadmin' : 'admin'
  return {
    isInternalByConfig,
    resolveRole,
    resolveStaffType,
    accessOf: (r: { email: string; role: string | null; staffType?: string | null }) =>
      resolveStaffType(r.email, r.role ?? 'user', r.staffType ?? null) ?? 'user',
    columnsFor: (a: string) => (a === 'user' ? { role: 'user', staffType: null } : { role: 'internal', staffType: a }),
    configuredInternalEmails: vi.fn(() => []),
  }
})

import { app } from '../app'
import * as userRepo from '../repositories/user.repository'
import * as zoneRepoMock from '../repositories/zone.repository'
import * as captureRepoMock from '../repositories/capture.repository'
import * as usageServiceMock from '../services/usage.service'
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
    staffType: null,
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
    id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal', staffType: 'superadmin' }) : row(),
  )
  vi.mocked(userRepo.findByIdWithPlan).mockImplementation(async (id: string) =>
    id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal', staffType: 'superadmin' }) : row(),
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
      id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal', staffType: 'superadmin' }) : undefined,
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

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/role`).send({ role: 'admin' })

    expect(res.status).toBe(200)
    expect(userRepo.updateUser).toHaveBeenCalledWith(TARGET_ID, { role: 'internal', staffType: 'admin' })
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

  it('refuses to demote the last superadmin', async () => {
    signedInAs(STAFF_ID)
    vi.mocked(userRepo.findById).mockImplementation(async (id: string) =>
      id === STAFF_ID
        ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal', staffType: 'superadmin' })
        : row({ role: 'internal', staffType: 'superadmin' }),
    )
    vi.mocked(userRepo.countSuperadmins).mockResolvedValue(1)

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/role`).send({ role: 'user' })

    // Losing every internal account is unrecoverable through the API — the only fix
    // would be editing the database by hand.
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/last superadmin/)
    expect(userRepo.updateUser).not.toHaveBeenCalled()
  })

  it('allows demoting one of several superadmins', async () => {
    signedInAs(STAFF_ID)
    vi.mocked(userRepo.findById).mockImplementation(async (id: string) =>
      id === STAFF_ID
        ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal', staffType: 'superadmin' })
        : row({ role: 'internal', staffType: 'superadmin' }),
    )
    vi.mocked(userRepo.countSuperadmins).mockResolvedValue(3)
    vi.mocked(userRepo.updateUser).mockResolvedValue(undefined)
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ role: 'user' }))

    const res = await request(app).patch(`/internal/users/${TARGET_ID}/role`).send({ role: 'user' })

    expect(res.status).toBe(200)
    expect(userRepo.updateUser).toHaveBeenCalledWith(TARGET_ID, { role: 'user', staffType: null })
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

describe('GET /internal/config (BE-12, ADR-018)', () => {
  it('mirrors the running config to staff, without any secret value', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    const res = await request(app).get('/internal/config')

    expect(res.status).toBe(200)
    const jwt = res.body.data.find((e: { key: string }) => e.key === 'JWT_SECRET')
    expect(jwt).toMatchObject({ secret: true, value: null })
    // The real secret from this process's environment must not appear anywhere.
    if (process.env.JWT_SECRET) expect(JSON.stringify(res.body)).not.toContain(process.env.JWT_SECRET)
  })

  it('is closed to customers', async () => {
    signedInAs(STAFF_ID)
    vi.mocked(userRepo.findById).mockResolvedValue(row({ id: STAFF_ID, email: 'budi@example.com', role: 'user' }))
    expect((await request(app).get('/internal/config')).status).toBe(403)
  })
})

describe('GET /internal/users/:id/plan-impact (ADR-020)', () => {
  it('previews exactly what a downgrade would pause, without changing anything', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    const zones = await import('../repositories/zone.repository')
    const schedules = await import('../repositories/schedule.repository')
    vi.mocked(zones.findByUserId).mockResolvedValue([
      { id: 'z1', name: 'Old zone', status: 'collecting', createdAt: new Date('2026-01-01') },
      { id: 'z2', name: 'New zone', status: 'collecting', createdAt: new Date('2026-02-01') },
    ] as never)
    vi.mocked(schedules.findByUserId).mockResolvedValue([])

    const res = await request(app).get('/internal/users/u_1/plan-impact?plan=free')

    expect(res.status).toBe(200)
    expect(res.body.data.clean).toBe(false)
    // Free allows one collecting zone; the newer one is the one paused.
    expect(res.body.data.zonesToPause.map((z: { name: string }) => z.name)).toEqual(['New zone'])
    expect(zones.update).not.toHaveBeenCalled()
  })

  it('rejects an unknown plan', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    expect((await request(app).get('/internal/users/u_1/plan-impact?plan=gold')).status).toBe(422)
  })
})

describe('Superadmin vs Admin (FE-34)', () => {
  const ADMIN_ID = 'staff_admin'
  function asAdmin() {
    signedInAs(ADMIN_ID)
    const admin = row({ id: ADMIN_ID, email: 'help@maceut.id', role: 'internal', staffType: 'admin' })
    vi.mocked(userRepo.findById).mockImplementation(async (id: string) => (id === ADMIN_ID ? admin : row()))
    vi.mocked(userRepo.findByIdWithPlan).mockImplementation(async (id: string) => (id === ADMIN_ID ? admin : row()))
  }

  it.each([
    ['get', '/internal/config'],
    ['post', '/internal/users'],
    ['patch', `/internal/users/${TARGET_ID}`],
    ['delete', `/internal/users/${TARGET_ID}`],
    ['patch', `/internal/users/${TARGET_ID}/role`],
    ['get', '/internal/here-usage'],
  ] as const)('an admin gets 403 on %s %s', async (method, path) => {
    asAdmin()
    const res = await request(app)[method](path).send({ role: 'user', fullName: 'X', email: 'x@y.z' })
    expect(res.status).toBe(403)
    expect(res.body.error.message).toBe('Superadmins only.')
  })

  it('an admin can still change a customer’s plan', async () => {
    asAdmin()
    vi.mocked(userRepo.setPlan).mockResolvedValue(undefined as never)
    const res = await request(app).patch(`/internal/users/${TARGET_ID}/plan`).send({ plan: 'standard' })
    expect(res.status).toBe(200)
  })

  it('reports the staff type on each account', async () => {
    asAdmin()
    const res = await request(app).get(`/internal/users/${ADMIN_ID}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ role: 'internal', staffType: 'admin' })
  })

  it('treats the legacy role value `internal` as admin, never superadmin', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(userRepo.updateUser).mockResolvedValue(undefined)
    await request(app).patch(`/internal/users/${TARGET_ID}/role`).send({ role: 'internal' })
    expect(userRepo.updateUser).toHaveBeenCalledWith(TARGET_ID, { role: 'internal', staffType: 'admin' })
  })
})

describe('GET /internal/users/:id/usage (FE-34)', () => {
  it('returns measured usage, zones with 7-day captures, and windows', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(usageServiceMock.getUsage).mockResolvedValue({ storageUsedGb: 1.25, capturesToday: 12 } as never)
    vi.mocked(zoneRepoMock.findByUserId).mockResolvedValue([
      { id: 'z1', name: 'YOG', status: 'collecting', pausedByPlan: false, roadClass: 'nasional', createdAt: new Date('2026-09-01T00:00:00Z') },
    ] as never)
    vi.mocked(captureRepoMock.countsByZoneSince).mockResolvedValue(new Map([['z1', 96]]))

    const res = await request(app).get(`/internal/users/${TARGET_ID}/usage`)

    expect(res.status).toBe(200)
    expect(res.body.data.usage).toMatchObject({ storageUsedGb: 1.25, capturesToday: 12 })
    expect(res.body.data.zones[0]).toMatchObject({ name: 'YOG', capturesLast7Days: 96 })
    expect(res.body.data.user.id).toBe(TARGET_ID)
  })

  it('is refused to customers', async () => {
    signedInAs(TARGET_ID)
    staffLookups()
    expect((await request(app).get(`/internal/users/${TARGET_ID}/usage`)).status).toBe(403)
  })

  it('returns 404 for an unknown account', async () => {
    signedInAs(STAFF_ID)
    staffLookups()
    vi.mocked(userRepo.findByIdWithPlan).mockImplementation(async (id: string) =>
      id === STAFF_ID ? row({ id: STAFF_ID, email: 'ops@maceut.id', role: 'internal', staffType: 'superadmin' }) : undefined,
    )
    expect((await request(app).get(`/internal/users/nobody/usage`)).status).toBe(404)
  })
})
