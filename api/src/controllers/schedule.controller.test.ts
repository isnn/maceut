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
  updateUser: vi.fn(),
  listWithPlans: vi.fn(),
  countInternal: vi.fn(),
}))
vi.mock('../repositories/schedule.repository', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByWorkspaceId: vi.fn(),
  findByZoneId: vi.fn(),
  findAllActive: vi.fn(),
  countActive: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
}))
vi.mock('../repositories/zone.repository', () => ({ findById: vi.fn() }))
vi.mock('../repositories/workspace.repository', () => ({ getPlan: vi.fn() }))

import { app } from '../app'
import * as scheduleRepo from '../repositories/schedule.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as workspaceRepo from '../repositories/workspace.repository'
import * as workspaceService from '../services/workspace.service'
import { auth } from '../lib/auth'
import type { Plan } from '../types/plan'
import type { MemberRole } from '../types/workspace'

const USER_ID = 'user_01'
const WORKSPACE_ID = '9a1b2c3d-1111-4111-8111-111111111111'
const ZONE_ID = '3f8a1c2e-1111-4111-8111-111111111111'
const SCHEDULE_ID = '7c4d5e6f-1111-4111-8111-111111111111'

function row(over: Partial<scheduleRepo.ScheduleRecord> = {}): scheduleRepo.ScheduleRecord {
  return {
    id: SCHEDULE_ID,
    workspaceId: WORKSPACE_ID,
    zoneId: ZONE_ID,
    createdBy: USER_ID,
    label: 'Jam sibuk pagi',
    startTime: '07:00',
    endTime: '09:00',
    interval: 'hourly',
    days: [0, 1, 2, 3, 4],
    status: 'active',
    createdAt: new Date('2026-09-19T00:00:00Z'),
    updatedAt: new Date('2026-09-19T00:00:00Z'),
    ...over,
  } as scheduleRepo.ScheduleRecord
}

function signedIn(plan: Plan = 'premium', role: MemberRole = 'owner') {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER_ID }, session: { id: 's' } } as never)
  vi.spyOn(workspaceService, 'ensureWorkspace').mockResolvedValue({
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Dishub DIY',
    role,
  })
  vi.mocked(workspaceRepo.getPlan).mockResolvedValue(plan)
}

const body = {
  zoneId: ZONE_ID,
  label: 'Jam sibuk pagi',
  start: '07:00',
  end: '09:00',
  interval: 'hourly',
  days: [0, 1, 2, 3, 4],
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.mocked(scheduleRepo.countActive).mockResolvedValue(0)
  vi.mocked(scheduleRepo.findByWorkspaceId).mockResolvedValue([])
  vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE_ID, workspaceId: WORKSPACE_ID } as never)
})

describe('auth and role', () => {
  it('returns 401 without a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    expect((await request(app).get('/schedules')).status).toBe(401)
  })

  it('lets a Viewer read but not write', async () => {
    signedIn('premium', 'viewer')
    vi.mocked(scheduleRepo.findByWorkspaceId).mockResolvedValue([row()])

    expect((await request(app).get('/schedules')).status).toBe(200)

    const res = await request(app).post('/schedules').send(body)
    expect(res.status).toBe(403)
    expect(scheduleRepo.create).not.toHaveBeenCalled()
  })

  it('lets an Editor write', async () => {
    signedIn('premium', 'editor')
    vi.mocked(scheduleRepo.create).mockResolvedValue(row())

    expect((await request(app).post('/schedules').send(body)).status).toBe(201)
  })
})

describe('POST /schedules', () => {
  it('creates a window and derives its cron', async () => {
    signedIn()
    vi.mocked(scheduleRepo.create).mockResolvedValue(row())

    const res = await request(app).post('/schedules').send(body)

    expect(res.status).toBe(201)
    expect(res.body.data.framesPerDay).toBe(2)
    // Derived on read, never stored — Mon–Fri is 1..5 in cron.
    expect(res.body.data.cron).toBe('0 7-8 * * 1,2,3,4,5')
  })

  it('returns 422 SCHEDULE_LIMIT_EXCEEDED at the plan limit (BR-005)', async () => {
    signedIn('free') // free allows 10 active windows
    vi.mocked(scheduleRepo.countActive).mockResolvedValue(10)

    const res = await request(app).post('/schedules').send({ ...body, interval: 'daily' })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('SCHEDULE_LIMIT_EXCEEDED')
    expect(scheduleRepo.create).not.toHaveBeenCalled()
  })

  it('refuses an interval above the plan', async () => {
    signedIn('free') // free is daily only

    const res = await request(app).post('/schedules').send({ ...body, interval: '15min' })

    expect(res.status).toBe(403)
    expect(scheduleRepo.create).not.toHaveBeenCalled()
  })

  it('refuses a window that would exceed the daily frame budget (BR-006)', async () => {
    signedIn('standard') // 50 captures/day, hourly allowed
    // 07:00–23:00 hourly = 16 frames; four existing windows like it already run Monday.
    vi.mocked(scheduleRepo.findByWorkspaceId).mockResolvedValue([
      row({ id: 'a', startTime: '07:00', endTime: '23:00' }),
      row({ id: 'b', startTime: '07:00', endTime: '23:00' }),
      row({ id: 'c', startTime: '07:00', endTime: '23:00' }),
    ])

    const res = await request(app)
      .post('/schedules')
      .send({ ...body, start: '07:00', end: '23:00' })

    expect(res.status).toBe(422)
    expect(res.body.error.details).toMatchObject({ dailyLimit: 50 })
    expect(scheduleRepo.create).not.toHaveBeenCalled()
  })

  it('judges the budget on the worst day, not the average', async () => {
    signedIn('standard')
    // A heavy window that only runs on Sunday must not block a Monday window.
    vi.mocked(scheduleRepo.findByWorkspaceId).mockResolvedValue([
      row({ id: 'sunday-only', startTime: '00:00', endTime: '23:00', days: [6] }),
    ])
    vi.mocked(scheduleRepo.create).mockResolvedValue(row())

    const res = await request(app)
      .post('/schedules')
      .send({ ...body, days: [0] })

    expect(res.status).toBe(201)
  })

  it('rejects an end time before the start', async () => {
    signedIn()
    const res = await request(app).post('/schedules').send({ ...body, start: '09:00', end: '07:00' })
    expect(res.status).toBe(422)
  })

  it('rejects an empty day list', async () => {
    signedIn()
    expect((await request(app).post('/schedules').send({ ...body, days: [] })).status).toBe(422)
  })

  it('rejects duplicate days', async () => {
    signedIn()
    const res = await request(app).post('/schedules').send({ ...body, days: [0, 0, 1] })
    expect(res.status).toBe(422)
  })

  it('refuses a zone from another workspace', async () => {
    signedIn()
    vi.mocked(zoneRepo.findById).mockResolvedValue({ id: ZONE_ID, workspaceId: 'other' } as never)

    const res = await request(app).post('/schedules').send(body)

    expect(res.status).toBe(404)
    expect(scheduleRepo.create).not.toHaveBeenCalled()
  })
})

describe('PATCH /schedules/:id', () => {
  beforeEach(() => vi.mocked(scheduleRepo.findById).mockResolvedValue(row()))

  it('pauses a window', async () => {
    signedIn()
    vi.mocked(scheduleRepo.update).mockResolvedValue(row({ status: 'paused' }))

    const res = await request(app).patch(`/schedules/${SCHEDULE_ID}`).send({ active: false })

    expect(res.status).toBe(200)
    expect(res.body.data.active).toBe(false)
  })

  it('refuses to resume past the plan limit (F-06 edge case)', async () => {
    signedIn('free')
    vi.mocked(scheduleRepo.findById).mockResolvedValue(row({ status: 'paused' }))
    vi.mocked(scheduleRepo.countActive).mockResolvedValue(10)

    const res = await request(app).patch(`/schedules/${SCHEDULE_ID}`).send({ active: true })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('SCHEDULE_LIMIT_EXCEEDED')
    expect(scheduleRepo.update).not.toHaveBeenCalled()
  })

  it('excludes itself from the limit count when already active', async () => {
    signedIn('free')
    vi.mocked(scheduleRepo.countActive).mockResolvedValue(9)
    vi.mocked(scheduleRepo.update).mockResolvedValue(row({ label: 'Renamed' }))

    const res = await request(app).patch(`/schedules/${SCHEDULE_ID}`).send({ label: 'Renamed' })

    expect(res.status).toBe(200)
  })

  it('cannot move a window to another zone', async () => {
    signedIn()
    vi.mocked(scheduleRepo.update).mockResolvedValue(row())

    await request(app).patch(`/schedules/${SCHEDULE_ID}`).send({ zoneId: 'aaaaaaaa-1111-4111-8111-111111111111' })

    // zoneId is not in the update schema, so it is dropped rather than applied —
    // a window pointing at a different zone is a different window (F-06).
    expect(scheduleRepo.update).not.toHaveBeenCalledWith(SCHEDULE_ID, expect.objectContaining({ zoneId: expect.anything() }))
  })

  it('rejects an empty patch', async () => {
    signedIn()
    expect((await request(app).patch(`/schedules/${SCHEDULE_ID}`).send({})).status).toBe(422)
  })

  it('refuses a window in another workspace', async () => {
    signedIn()
    vi.mocked(scheduleRepo.findById).mockResolvedValue(row({ workspaceId: 'other' }))

    const res = await request(app).patch(`/schedules/${SCHEDULE_ID}`).send({ label: 'Hijacked' })

    expect(res.status).toBe(403)
  })
})

describe('DELETE /schedules/:id', () => {
  it('soft deletes so capture history keeps its reference', async () => {
    signedIn()
    vi.mocked(scheduleRepo.findById).mockResolvedValue(row())

    const res = await request(app).delete(`/schedules/${SCHEDULE_ID}`)

    expect(res.status).toBe(200)
    expect(scheduleRepo.softDelete).toHaveBeenCalledWith(SCHEDULE_ID)
  })
})

describe('GET /schedules', () => {
  it('lists windows for the workspace', async () => {
    signedIn()
    vi.mocked(scheduleRepo.findByWorkspaceId).mockResolvedValue([row()])

    const res = await request(app).get('/schedules')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(scheduleRepo.findByWorkspaceId).toHaveBeenCalledWith(WORKSPACE_ID)
  })

  it('filters to one zone when asked', async () => {
    signedIn()
    vi.mocked(scheduleRepo.findByZoneId).mockResolvedValue([row()])

    await request(app).get(`/schedules?zoneId=${ZONE_ID}`)

    expect(scheduleRepo.findByZoneId).toHaveBeenCalledWith(ZONE_ID)
  })
})
