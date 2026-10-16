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
vi.mock('../repositories/notification.repository', () => ({
  DEFAULT_PREFERENCES: { emailCaptureProblems: true },
  listForUser: vi.fn(),
  unreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  getPreferences: vi.fn(),
  setPreferences: vi.fn(async (_u: string, p: unknown) => p),
}))

import { app } from '../app'
import * as userRepo from '../repositories/user.repository'
import * as notificationRepo from '../repositories/notification.repository'
import { auth } from '../lib/auth'

const USER_ID = 'user_01'
const ID = '7c1d2e3f-5555-4555-8555-555555555555'

function signedIn() {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER_ID }, session: { id: 's' } } as never)
  vi.mocked(userRepo.findById).mockResolvedValue({ id: USER_ID, email: 'budi@example.com', role: 'user' } as never)
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan: 'standard' } as never)
}

beforeEach(() => vi.clearAllMocks())

describe('GET /notifications', () => {
  it('returns the latest notifications and the unread count', async () => {
    signedIn()
    vi.mocked(notificationRepo.listForUser).mockResolvedValue([
      {
        id: ID,
        userId: USER_ID,
        type: 'capture_failing',
        tone: 'warning',
        title: 'Sudirman stopped collecting',
        body: 'The 07:00 WIB capture failed.',
        actionLabel: 'Open zone',
        actionHref: '/zones/z1',
        data: { zoneId: 'z1' },
        dedupeKey: 'k',
        readAt: null,
        emailStatus: 'pending',
        emailDueAt: new Date(),
        emailAttempts: 0,
        emailedAt: null,
        emailSkipReason: null,
        createdAt: new Date('2026-09-28T00:00:00Z'),
      },
    ] as never)
    vi.mocked(notificationRepo.unreadCount).mockResolvedValue(1)

    const res = await request(app).get('/notifications?limit=5')

    expect(res.status).toBe(200)
    expect(notificationRepo.listForUser).toHaveBeenCalledWith(USER_ID, 5)
    expect(res.body.data.unreadCount).toBe(1)
    // Internal fields (dedupe key, email state) never reach the client.
    expect(res.body.data.items[0]).toEqual({
      id: ID,
      type: 'capture_failing',
      tone: 'warning',
      title: 'Sudirman stopped collecting',
      body: 'The 07:00 WIB capture failed.',
      actionLabel: 'Open zone',
      actionHref: '/zones/z1',
      zoneName: null,
      read: false,
      createdAt: '2026-09-28T00:00:00.000Z',
    })
  })

  it('requires a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    expect((await request(app).get('/notifications')).status).toBe(401)
  })
})

describe('POST /notifications/:id/read', () => {
  it("marks the user's own notification read", async () => {
    signedIn()
    vi.mocked(notificationRepo.markRead).mockResolvedValue(true)
    const res = await request(app).post(`/notifications/${ID}/read`)
    expect(res.status).toBe(200)
    expect(notificationRepo.markRead).toHaveBeenCalledWith(USER_ID, ID)
  })

  it("404s for someone else's (or no) notification", async () => {
    signedIn()
    vi.mocked(notificationRepo.markRead).mockResolvedValue(false)
    expect((await request(app).post(`/notifications/${ID}/read`)).status).toBe(404)
  })

  it('rejects an id that is not a uuid', async () => {
    signedIn()
    expect((await request(app).post('/notifications/nope/read')).status).toBe(422)
  })
})

describe('POST /notifications/read-all', () => {
  it('marks everything read', async () => {
    signedIn()
    vi.mocked(notificationRepo.markAllRead).mockResolvedValue(3)
    const res = await request(app).post('/notifications/read-all')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ marked: 3 })
  })

  it('requires a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    expect((await request(app).post('/notifications/read-all')).status).toBe(401)
  })
})

describe('/me/notification-preferences', () => {
  it('returns the defaults when nothing is saved', async () => {
    signedIn()
    vi.mocked(notificationRepo.getPreferences).mockResolvedValue({ emailCaptureProblems: true })
    const res = await request(app).get('/me/notification-preferences')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ emailCaptureProblems: true })
  })

  it('saves the email switch', async () => {
    signedIn()
    const res = await request(app).patch('/me/notification-preferences').send({ emailCaptureProblems: false })
    expect(res.status).toBe(200)
    expect(notificationRepo.setPreferences).toHaveBeenCalledWith(USER_ID, { emailCaptureProblems: false })
  })

  it('rejects a body without the switch', async () => {
    signedIn()
    expect((await request(app).patch('/me/notification-preferences').send({})).status).toBe(422)
  })

  it('requires a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    expect((await request(app).patch('/me/notification-preferences').send({ emailCaptureProblems: true })).status).toBe(401)
  })
})
