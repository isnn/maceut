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
const flags = vi.hoisted(() => ({ autoRenew: false }))
vi.mock('../services/auto-renew.service', () => ({
  isAutoRenewEnabled: () => flags.autoRenew,
  stop: vi.fn(),
  handleSubscriptionNotification: vi.fn(async () => 'applied'),
}))
vi.mock('../services/payment.service', () => ({
  prices: vi.fn(() => ({ enabled: true, prices: { free: 0, starter: 99000, standard: 349000, premium: 1490000 }, periodDays: 30 })),
  checkout: vi.fn(),
  pending: vi.fn(),
  sync: vi.fn(),
  handleNotification: vi.fn(),
  history: vi.fn(async () => []),
  changeMethod: vi.fn(),
}))
vi.mock('../services/invoice.service', () => ({ invoicePdf: vi.fn() }))

import { app } from '../app'
import * as userRepo from '../repositories/user.repository'
import * as paymentService from '../services/payment.service'
import * as autoRenew from '../services/auto-renew.service'
import * as invoiceService from '../services/invoice.service'
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
  flags.autoRenew = false
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
})

describe('T26: customer payment routes need a session', () => {
  it.each([
    ['get', '/payments/prices'],
    ['post', '/payments/checkout'],
    ['get', '/payments/pending'],
    ['get', '/payments/history'],
    ['post', '/payments/auto-renew'],
    ['delete', '/payments/auto-renew'],
    ['get', '/payments/MCT-abc-1'],
    ['post', '/payments/MCT-abc-1/change-method'],
    ['get', '/payments/MCT-abc-1/invoice'],
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

describe('/payments/auto-renew', () => {
  it('A6: 404 while MIDTRANS_AUTO_RENEW_ENABLED is off', async () => {
    signedIn()
    expect((await request(app).post('/payments/auto-renew').send({ plan: 'starter' })).status).toBe(404)
    expect((await request(app).delete('/payments/auto-renew')).status).toBe(404)
    expect(paymentService.checkout).not.toHaveBeenCalled()
  })

  it('turns on through a card-saving checkout, and off through stop()', async () => {
    signedIn()
    flags.autoRenew = true
    vi.mocked(paymentService.checkout).mockResolvedValue({ orderId: 'MCT-1', token: 't', redirectUrl: 'r', amount: 99000, plan: 'starter', reused: false })

    expect((await request(app).post('/payments/auto-renew').send({ plan: 'starter' })).status).toBe(201)
    expect(paymentService.checkout).toHaveBeenCalledWith(USER_ID, 'starter', expect.any(Date), { autoRenewSetup: true })

    expect((await request(app).delete('/payments/auto-renew')).status).toBe(200)
    expect(autoRenew.stop).toHaveBeenCalledWith(USER_ID)
  })
})

describe('POST /payments/midtrans/notification', () => {
  it('routes subscription charges (no signature) to the auto-renew handler', async () => {
    const body = { event_name: 'subscription.charge', subscription: { id: 'sub1' }, transaction: { transaction_id: 'tx' } }
    const res = await request(app).post('/payments/midtrans/notification').send(body)
    expect(res.status).toBe(200)
    expect(autoRenew.handleSubscriptionNotification).toHaveBeenCalledWith(body)
    expect(paymentService.handleNotification).not.toHaveBeenCalled()
  })

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

describe('POST /payments/:orderId/change-method', () => {
  it('returns the Snap page to open for the signed-in owner', async () => {
    signedIn()
    vi.mocked(paymentService.changeMethod).mockResolvedValue({ payment: { orderId: 'MCT-abc-1' }, checkout: { orderId: 'MCT-abc-2', token: 't2' } } as never)

    const res = await request(app).post('/payments/MCT-abc-1/change-method')

    expect(res.status).toBe(200)
    expect(res.body.data.checkout.token).toBe('t2')
    expect(paymentService.changeMethod).toHaveBeenCalledWith(USER_ID, 'MCT-abc-1')
  })

  it("404 for someone else's payment", async () => {
    signedIn()
    vi.mocked(paymentService.changeMethod).mockRejectedValue(new NotFoundError('Payment'))
    expect((await request(app).post('/payments/MCT-abc-1/change-method')).status).toBe(404)
  })
})

describe('GET /payments/:orderId/invoice', () => {
  it('sends the PDF as a download', async () => {
    signedIn()
    vi.mocked(invoiceService.invoicePdf).mockResolvedValue({ filename: 'maceut-invoice-MCT-abc-1.pdf', pdf: Buffer.from('%PDF-1.4 x') })

    const res = await request(app).get('/payments/MCT-abc-1/invoice')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toBe('attachment; filename="maceut-invoice-MCT-abc-1.pdf"')
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(invoiceService.invoicePdf).toHaveBeenCalledWith(USER_ID, 'MCT-abc-1')
  })

  it('422 while the payment is not confirmed', async () => {
    signedIn()
    vi.mocked(invoiceService.invoicePdf).mockRejectedValue(new ValidationError('An invoice is available once the payment is confirmed.'))
    expect((await request(app).get('/payments/MCT-abc-1/invoice')).status).toBe(422)
  })
})
