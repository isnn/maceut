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
vi.mock('../services/payment.service', () => ({
  prices: vi.fn(() => ({ enabled: true, prices: { free: 0, starter: 99000, standard: 349000, premium: 1490000 }, periodDays: 30 })),
  checkout: vi.fn(),
  pending: vi.fn(),
  sync: vi.fn(),
  handleNotification: vi.fn(),
  history: vi.fn(async () => []),
}))

import { app } from '../app'
import * as userRepo from '../repositories/user.repository'
import * as paymentService from '../services/payment.service'
import { auth } from '../lib/auth'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors'

const USER_ID = 'user_01'

function signedIn() {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER_ID }, session: { id: 's' } } as never)
  vi.mocked(userRepo.findById).mockResolvedValue({ id: USER_ID, email: 'budi@example.com', role: 'user' } as never)
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ plan: 'free' } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
})

describe('T26: customer payment routes need a session', () => {
  it.each([
    ['get', '/payments/prices'],
    ['post', '/payments/checkout'],
    ['get', '/payments/pending'],
    ['get', '/payments/history'],
    ['get', '/payments/MCT-abc-1'],
  ] as const)('%s %s → 401', async (method, path) => {
    const res = await request(app)[method](path).send({ plan: 'starter' })
    expect(res.status).toBe(401)
  })
})

describe('POST /payments/checkout', () => {
  it('returns the Snap token', async () => {
    signedIn()
    vi.mocked(paymentService.checkout).mockResolvedValue({
      orderId: 'MCT-abc-1',
      token: 'tok',
      redirectUrl: 'https://r',
      amount: 99000,
      plan: 'starter',
      reused: false,
    })

    const res = await request(app).post('/payments/checkout').send({ plan: 'starter' })

    expect(res.status).toBe(201)
    expect(res.body.data.token).toBe('tok')
    expect(paymentService.checkout).toHaveBeenCalledWith(USER_ID, 'starter')
  })

  it('rejects an unknown plan before the service', async () => {
    signedIn()
    const res = await request(app).post('/payments/checkout').send({ plan: 'gold' })
    expect(res.status).toBe(422)
    expect(paymentService.checkout).not.toHaveBeenCalled()
  })

  it('passes a service refusal through', async () => {
    signedIn()
    vi.mocked(paymentService.checkout).mockRejectedValue(new ValidationError('Choose a paid plan.'))
    const res = await request(app).post('/payments/checkout').send({ plan: 'free' })
    expect(res.status).toBe(422)
  })
})

describe('GET /payments/history', () => {
  it('lists the account’s own payments and is not mistaken for an order id', async () => {
    signedIn()
    const res = await request(app).get('/payments/history')
    expect(res.status).toBe(200)
    expect(paymentService.history).toHaveBeenCalledWith(USER_ID)
    expect(paymentService.sync).not.toHaveBeenCalled()
  })
})

describe('GET /payments/:orderId', () => {
  it('syncs the owner’s payment', async () => {
    signedIn()
    vi.mocked(paymentService.sync).mockResolvedValue({ orderId: 'MCT-abc-1', status: 'paid' } as never)
    const res = await request(app).get('/payments/MCT-abc-1')
    expect(res.status).toBe(200)
    expect(paymentService.sync).toHaveBeenCalledWith(USER_ID, 'MCT-abc-1')
  })

  it('404s someone else’s', async () => {
    signedIn()
    vi.mocked(paymentService.sync).mockRejectedValue(new NotFoundError('Payment'))
    expect((await request(app).get('/payments/MCT-abc-1')).status).toBe(404)
  })
})

describe('POST /payments/midtrans/notification', () => {
  const body = { order_id: 'MCT-abc-1', status_code: '200', gross_amount: '99000.00', transaction_status: 'settlement', signature_key: 'x' }

  it('needs no session, and answers 200 once accepted', async () => {
    vi.mocked(paymentService.handleNotification).mockResolvedValue('applied')

    const res = await request(app).post('/payments/midtrans/notification').send(body)

    expect(res.status).toBe(200)
    expect(res.body.data.result).toBe('applied')
    expect(auth.api.getSession).not.toHaveBeenCalled()
    expect(paymentService.handleNotification).toHaveBeenCalledWith(body)
  })

  it('T15: 200 for an order it does not know, so Midtrans stops retrying', async () => {
    vi.mocked(paymentService.handleNotification).mockResolvedValue('unknown_order')
    expect((await request(app).post('/payments/midtrans/notification').send(body)).status).toBe(200)
  })

  it('T10: 403 on a bad signature', async () => {
    vi.mocked(paymentService.handleNotification).mockRejectedValue(new ForbiddenError('Invalid notification signature.'))
    expect((await request(app).post('/payments/midtrans/notification').send(body)).status).toBe(403)
  })

  it('T16: 500 on a database failure, so Midtrans retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(paymentService.handleNotification).mockRejectedValue(new Error('connection lost'))
    expect((await request(app).post('/payments/midtrans/notification').send(body)).status).toBe(500)
  })
})
