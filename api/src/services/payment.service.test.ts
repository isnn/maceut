import { describe, it, expect, vi, beforeEach } from 'vitest'

const cfg = vi.hoisted(() => ({
  midtransServerKey: 'SB-Mid-server-TESTKEY' as string | undefined,
  midtransMerchantId: 'G123' as string | undefined,
  frontendUrl: 'https://maceut.hokya.dev',
}))
vi.mock('../config/env', () => ({ config: cfg, isMidtransConfigured: () => Boolean(cfg.midtransServerKey) }))
vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../lib/internal-access', () => ({ accessOf: (row: { role?: string }) => (row.role === 'internal' ? 'admin' : 'user') }))
vi.mock('../lib/midtrans-client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/midtrans-client')>()
  return { ...real, createSnapTransaction: vi.fn(), getStatus: vi.fn(), verifySignature: vi.fn(() => true) }
})
vi.mock('../repositories/payment.repository', () => ({
  create: vi.fn(),
  findByOrderId: vi.fn(),
  findPendingSince: vi.fn(),
  findOpenSince: vi.fn(),
  markPending: vi.fn(),
  transition: vi.fn(),
  markRefunded: vi.fn(),
  noteProviderStatus: vi.fn(),
  setPeriodEnd: vi.fn(),
}))
vi.mock('../repositories/user.repository', () => ({ findByIdWithPlan: vi.fn(), findPlanRow: vi.fn(), setPlan: vi.fn() }))
vi.mock('../repositories/plan-change.repository', () => ({ record: vi.fn() }))
vi.mock('./plan.service', () => ({ applyPlanChange: vi.fn(async () => ({ zonesToPause: [], schedulesToPause: [] })) }))
vi.mock('./notification.service', () => ({ onPaymentActivated: vi.fn() }))

import { activate, checkout, handleNotification, newOrderId, sync } from './payment.service'
import * as midtrans from '../lib/midtrans-client'
import * as paymentRepo from '../repositories/payment.repository'
import * as userRepo from '../repositories/user.repository'
import * as planChangeRepo from '../repositories/plan-change.repository'
import * as notificationService from './notification.service'
import type { PaymentRow } from '../../drizzle/schema'

const USER = 'u_abc123XYZ'
const NOW = new Date('2026-10-17T03:00:00Z')
const DAY = 86_400_000

function account(plan = 'free', role = 'user') {
  return { id: USER, email: 'budi@example.com', name: 'Budi', role, plan } as never
}

function payment(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'p1',
    userId: USER,
    orderId: 'MCT-uabc123X-1',
    plan: 'starter',
    amount: 99_000,
    status: 'pending',
    snapToken: 'tok',
    redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/x',
    providerStatus: null,
    paymentType: null,
    transactionId: null,
    paidAt: null,
    periodEnd: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }
}

function status(transaction_status: string, over: Record<string, string> = {}) {
  return { order_id: 'MCT-uabc123X-1', status_code: '200', gross_amount: '99000.00', transaction_status, payment_type: 'qris', ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  cfg.midtransServerKey = 'SB-Mid-server-TESTKEY'
  cfg.midtransMerchantId = 'G123'
  vi.mocked(midtrans.verifySignature).mockReturnValue(true)
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account())
  vi.mocked(userRepo.findPlanRow).mockResolvedValue({ plan: 'free', expiresAt: null } as never)
  vi.mocked(paymentRepo.findPendingSince).mockResolvedValue(undefined)
  vi.mocked(midtrans.createSnapTransaction).mockResolvedValue({ token: 'tok', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/x' })
})

describe('newOrderId', () => {
  it('fits Midtrans order_id rules and is new every millisecond', () => {
    const id = newOrderId('u_abc-123.XYZ', NOW)
    expect(id).toMatch(/^MCT-[a-zA-Z0-9]{1,8}-\d+$/)
    expect(id.length).toBeLessThanOrEqual(50)
    expect(newOrderId(USER, new Date(NOW.getTime() + 1))).not.toBe(newOrderId(USER, NOW))
  })
})

describe('checkout', () => {
  it('T4: refuses Free and plans below the current one, without calling Midtrans', async () => {
    await expect(checkout(USER, 'free', NOW)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('standard'))
    await expect(checkout(USER, 'starter', NOW)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(midtrans.createSnapTransaction).not.toHaveBeenCalled()
  })

  it('refuses staff accounts, which have no customer plan', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('free', 'internal'))
    await expect(checkout(USER, 'starter', NOW)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('T5: records the attempt BEFORE calling Snap, at the server price, then marks it pending', async () => {
    const order: string[] = []
    vi.mocked(paymentRepo.create).mockImplementation(async () => {
      order.push('create')
      return payment({ status: 'creating' })
    })
    vi.mocked(midtrans.createSnapTransaction).mockImplementation(async () => {
      order.push('snap')
      return { token: 'tok', redirect_url: 'https://r' }
    })

    const res = await checkout(USER, 'starter', NOW)

    expect(order).toEqual(['create', 'snap'])
    expect(paymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, plan: 'starter', amount: 99_000 }))
    const body = vi.mocked(midtrans.createSnapTransaction).mock.calls[0]![0]
    expect(body.transaction_details.gross_amount).toBe(99_000)
    expect(body.item_details.reduce((n, i) => n + i.price * i.quantity, 0)).toBe(99_000)
    expect(body.enabled_payments).toBeUndefined() // every method active in Snap Preference
    expect(body.credit_card).toEqual({ secure: true })
    expect(body.callbacks?.finish).toBe(`https://maceut.hokya.dev/profile?payment=${encodeURIComponent(res.orderId)}`)
    expect(paymentRepo.markPending).toHaveBeenCalledWith(res.orderId, 'tok', 'https://r')
    expect(res).toMatchObject({ token: 'tok', amount: 99_000, plan: 'starter', reused: false })
  })

  it('T6: allows renewing the same paid plan', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('starter'))
    vi.mocked(userRepo.findPlanRow).mockResolvedValue({ plan: 'starter', expiresAt: new Date(NOW.getTime() + 5 * DAY) } as never)
    await expect(checkout(USER, 'starter', NOW)).resolves.toMatchObject({ plan: 'starter' })
  })

  it('refuses to "renew" a plan staff set without an end date', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('standard'))
    vi.mocked(userRepo.findPlanRow).mockResolvedValue({ plan: 'standard', expiresAt: null } as never)
    await expect(checkout(USER, 'standard', NOW)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('T7: reopens a pending payment for the same plan instead of starting another', async () => {
    vi.mocked(paymentRepo.findPendingSince).mockResolvedValue(payment())

    const res = await checkout(USER, 'starter', NOW)

    expect(res).toMatchObject({ orderId: 'MCT-uabc123X-1', token: 'tok', reused: true })
    expect(paymentRepo.create).not.toHaveBeenCalled()
    expect(midtrans.createSnapTransaction).not.toHaveBeenCalled()
  })

  it('T8: a Snap failure marks the attempt failed and leaves the plan alone', async () => {
    vi.mocked(midtrans.createSnapTransaction).mockRejectedValue(Object.assign(new Error('x'), { code: 'PAYMENT_PROVIDER_ERROR' }))

    await expect(checkout(USER, 'starter', NOW)).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' })

    expect(paymentRepo.transition).toHaveBeenCalledWith(expect.stringMatching(/^MCT-/), 'failed', { providerStatus: 'snap_error' })
    expect(paymentRepo.markPending).not.toHaveBeenCalled()
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })

  it('T9: answers PAYMENTS_NOT_CONFIGURED without a server key', async () => {
    cfg.midtransServerKey = undefined
    await expect(checkout(USER, 'starter', NOW)).rejects.toMatchObject({ code: 'PAYMENTS_NOT_CONFIGURED', statusCode: 503 })
  })
})

describe('handleNotification', () => {
  beforeEach(() => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(payment())
    vi.mocked(midtrans.getStatus).mockResolvedValue(status('settlement'))
    vi.mocked(paymentRepo.transition).mockImplementation(async (_o, to) => payment({ status: to }))
  })

  it('T10: refuses a bad signature and changes nothing', async () => {
    vi.mocked(midtrans.verifySignature).mockReturnValue(false)
    await expect(handleNotification(status('settlement'))).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(paymentRepo.findByOrderId).not.toHaveBeenCalled()
  })

  it('refuses a notification for another merchant', async () => {
    await expect(handleNotification({ ...status('settlement'), merchant_id: 'OTHER' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('T11: a settlement confirmed by Get Status activates the plan for 30 days', async () => {
    const res = await handleNotification(status('settlement'))

    expect(res).toBe('applied')
    expect(midtrans.getStatus).toHaveBeenCalledWith('MCT-uabc123X-1')
    expect(paymentRepo.transition).toHaveBeenCalledWith('MCT-uabc123X-1', 'paid', expect.objectContaining({ providerStatus: 'settlement' }))
    expect(userRepo.setPlan).toHaveBeenCalledWith(USER, 'starter', expect.objectContaining({ keepStartedAt: false }))
    expect(planChangeRepo.record).toHaveBeenCalledWith(expect.objectContaining({ fromPlan: 'free', toPlan: 'starter', source: 'payment' }))
    expect(notificationService.onPaymentActivated).toHaveBeenCalledOnce()
  })

  it('trusts Get Status over the notification body', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(status('pending'))
    expect(await handleNotification(status('settlement'))).toBe('unchanged')
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })

  it('T12: the same settlement twice activates once', async () => {
    vi.mocked(paymentRepo.transition).mockResolvedValueOnce(payment({ status: 'paid' })).mockResolvedValueOnce(undefined)

    expect(await handleNotification(status('settlement'))).toBe('applied')
    expect(await handleNotification(status('settlement'))).toBe('unchanged')
    expect(userRepo.setPlan).toHaveBeenCalledTimes(1)
  })

  it('T13: an expire arriving after paid changes nothing', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(status('expire'))
    vi.mocked(paymentRepo.transition).mockResolvedValue(undefined) // the row is no longer open
    expect(await handleNotification(status('expire'))).toBe('unchanged')
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })

  it('T14: a different amount is logged and not activated', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(status('settlement', { gross_amount: '1000.00' }))
    expect(await handleNotification(status('settlement'))).toBe('unchanged')
    expect(paymentRepo.transition).not.toHaveBeenCalled()
    expect(paymentRepo.noteProviderStatus).toHaveBeenCalledWith(
      'MCT-uabc123X-1',
      expect.objectContaining({ providerStatus: 'amount_mismatch:settlement' }),
    )
  })

  it('T15: an order this server does not know is accepted and ignored', async () => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(undefined)
    expect(await handleNotification(status('settlement'))).toBe('unknown_order')
    expect(midtrans.getStatus).not.toHaveBeenCalled()
  })

  it('T16: a database failure propagates, so the route answers 500 and Midtrans retries', async () => {
    vi.mocked(paymentRepo.findByOrderId).mockRejectedValue(new Error('connection lost'))
    await expect(handleNotification(status('settlement'))).rejects.toThrow('connection lost')
  })

  it('maps failures without touching the plan', async () => {
    for (const [s, to] of [['deny', 'failed'], ['cancel', 'cancelled'], ['expire', 'expired']] as const) {
      vi.mocked(midtrans.getStatus).mockResolvedValueOnce(status(s))
      await handleNotification(status(s))
      expect(paymentRepo.transition).toHaveBeenLastCalledWith('MCT-uabc123X-1', to, expect.anything())
    }
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })

  it('records a refund on a paid payment and leaves the plan for staff', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(status('refund'))
    vi.mocked(paymentRepo.markRefunded).mockResolvedValue(payment({ status: 'refunded' }))
    expect(await handleNotification(status('refund'))).toBe('applied')
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })

  it('keeps a challenged card pending', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(status('capture', { fraud_status: 'challenge', payment_type: 'credit_card' }))
    expect(await handleNotification(status('capture'))).toBe('unchanged')
    expect(paymentRepo.transition).not.toHaveBeenCalled()
  })
})

describe('sync', () => {
  beforeEach(() => vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(payment()))

  it('T17: no transaction at Midtrans yet (no method picked) stays pending', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(null)
    const view = await sync(USER, 'MCT-uabc123X-1', NOW)
    expect(view.status).toBe('pending')
    expect(view.snapToken).toBe('tok') // still reopenable
    expect(paymentRepo.transition).not.toHaveBeenCalled()
  })

  it('T18: activates a settlement the notification has not delivered yet', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(status('settlement'))
    vi.mocked(paymentRepo.transition).mockResolvedValue(payment({ status: 'paid' }))
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValueOnce(payment()).mockResolvedValueOnce(payment({ status: 'paid' }))

    const view = await sync(USER, 'MCT-uabc123X-1', NOW)

    expect(view.status).toBe('paid')
    expect(view.snapToken).toBeNull()
    expect(userRepo.setPlan).toHaveBeenCalledOnce()
  })

  it('T19: another account’s payment is not found', async () => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(payment({ userId: 'someone_else' }))
    await expect(sync(USER, 'MCT-uabc123X-1', NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('does not ask Midtrans about a payment that is already final', async () => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(payment({ status: 'paid' }))
    await sync(USER, 'MCT-uabc123X-1', NOW)
    expect(midtrans.getStatus).not.toHaveBeenCalled()
  })
})

describe('activate', () => {
  it('T20: a renewal with 10 days left adds 30 days to the current end and keeps "since"', async () => {
    const end = new Date(NOW.getTime() + 10 * DAY)
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('starter'))
    vi.mocked(userRepo.findPlanRow).mockResolvedValue({ plan: 'starter', expiresAt: end } as never)

    const periodEnd = await activate(payment({ status: 'paid' }), NOW)

    expect(periodEnd).toEqual(new Date(end.getTime() + 30 * DAY))
    expect(userRepo.setPlan).toHaveBeenCalledWith(USER, 'starter', { expiresAt: periodEnd, keepStartedAt: true })
    expect(paymentRepo.setPeriodEnd).toHaveBeenCalledWith('p1', periodEnd)
  })

  it('T21: an upgrade from a paid plan starts a fresh 30 days from now', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('starter'))
    vi.mocked(userRepo.findPlanRow).mockResolvedValue({ plan: 'starter', expiresAt: new Date(NOW.getTime() + 10 * DAY) } as never)

    const periodEnd = await activate(payment({ plan: 'premium', amount: 1_490_000, status: 'paid' }), NOW)

    expect(periodEnd).toEqual(new Date(NOW.getTime() + 30 * DAY))
    expect(userRepo.setPlan).toHaveBeenCalledWith(USER, 'premium', { expiresAt: periodEnd, keepStartedAt: false })
    expect(planChangeRepo.record).toHaveBeenCalledWith(expect.objectContaining({ fromPlan: 'starter', toPlan: 'premium', source: 'payment' }))
  })

  it('a renewal after the end date has passed starts from now', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('starter'))
    vi.mocked(userRepo.findPlanRow).mockResolvedValue({ plan: 'starter', expiresAt: new Date(NOW.getTime() - DAY) } as never)

    expect(await activate(payment({ status: 'paid' }), NOW)).toEqual(new Date(NOW.getTime() + 30 * DAY))
  })
})
