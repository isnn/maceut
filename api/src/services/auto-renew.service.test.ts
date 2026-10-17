import { describe, it, expect, vi, beforeEach } from 'vitest'

const cfg = vi.hoisted(() => ({
  midtransServerKey: 'SB-Mid-server-TESTKEY' as string | undefined,
  midtransMerchantId: 'G123' as string | undefined,
  midtransAutoRenewEnabled: true,
  frontendUrl: 'https://maceut.hokya.dev',
}))
vi.mock('../config/env', () => ({ config: cfg, isMidtransConfigured: () => Boolean(cfg.midtransServerKey) }))
vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../lib/internal-access', () => ({ accessOf: () => 'user' }))
vi.mock('../lib/midtrans-client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/midtrans-client')>()
  return {
    ...real,
    createSnapTransaction: vi.fn(),
    getStatus: vi.fn(),
    createSubscription: vi.fn(),
    getSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
  }
})
vi.mock('../repositories/payment.repository', () => ({
  create: vi.fn(),
  findPendingSince: vi.fn(),
  markPending: vi.fn(),
  transition: vi.fn(),
  setPeriodEnd: vi.fn(),
  insertSubscriptionCharge: vi.fn(),
}))
vi.mock('../repositories/user.repository', () => ({
  findByIdWithPlan: vi.fn(),
  findPlanRow: vi.fn(),
  setPlan: vi.fn(),
  setAutoRenew: vi.fn(),
  findBySubscriptionId: vi.fn(),
  extendPaidPeriod: vi.fn(),
}))
vi.mock('../repositories/plan-change.repository', () => ({ record: vi.fn() }))
vi.mock('./plan.service', () => ({ applyPlanChange: vi.fn(async () => ({ zonesToPause: [], schedulesToPause: [] })) }))
vi.mock('./notification.service', () => ({ onPaymentActivated: vi.fn(), onAutoRenewFailed: vi.fn(), onPaymentFailed: vi.fn() }))

import { handleSubscriptionNotification, isAutoRenewEnabled, startSubscription, stop } from './auto-renew.service'
import { activate, checkout } from './payment.service'
import * as midtrans from '../lib/midtrans-client'
import * as paymentRepo from '../repositories/payment.repository'
import * as userRepo from '../repositories/user.repository'
import * as notificationService from './notification.service'
import type { PaymentRow } from '../../drizzle/schema'

const USER = 'u_abc123XYZ'
const NOW = new Date('2026-10-17T03:00:00Z')
const DAY = 86_400_000

function payment(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'p1',
    userId: USER,
    orderId: 'MCT-uabc123X-1',
    plan: 'starter',
    amount: 99_000,
    status: 'paid',
    snapToken: null,
    redirectUrl: null,
    providerStatus: 'capture',
    paymentType: 'credit_card',
    transactionId: 't1',
    paidAt: NOW,
    autoRenewSetup: true,
    subscriptionId: null,
    periodEnd: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }
}

const charge = (over: Record<string, string> = {}) => ({
  order_id: 'MCT-SUB-uabc123X-1-0000000000000000000000000000001',
  status_code: '200',
  gross_amount: '99000.00',
  transaction_status: 'capture',
  fraud_status: 'accept',
  payment_type: 'credit_card',
  transaction_id: 'tx9',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {})
  cfg.midtransAutoRenewEnabled = true
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ id: USER, email: 'budi@example.com', name: 'Budi', role: 'user', plan: 'starter', autoRenew: false } as never)
  vi.mocked(userRepo.findPlanRow).mockResolvedValue({ plan: 'starter', expiresAt: new Date(NOW.getTime() + 5 * DAY) } as never)
  vi.mocked(paymentRepo.findPendingSince).mockResolvedValue(undefined)
  vi.mocked(midtrans.createSnapTransaction).mockResolvedValue({ token: 'tok', redirect_url: 'https://r' })
})

describe('switching it on (A1)', () => {
  it('is a card-only Snap payment that saves the card', async () => {
    await checkout(USER, 'starter', NOW, { autoRenewSetup: true })

    expect(paymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ autoRenewSetup: true }))
    const body = vi.mocked(midtrans.createSnapTransaction).mock.calls[0]![0]
    expect(body.enabled_payments).toEqual(['credit_card'])
    expect(body.credit_card).toEqual({ secure: true, save_card: true })
    expect(body.user_id).toBe(USER)
  })

  it('A6: is unavailable with the flag off', async () => {
    cfg.midtransAutoRenewEnabled = false
    expect(isAutoRenewEnabled()).toBe(false)
    await expect(checkout(USER, 'starter', NOW, { autoRenewSetup: true })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(midtrans.createSnapTransaction).not.toHaveBeenCalled()
  })

  it('refuses when it is already on', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ id: USER, email: 'b@x', role: 'user', plan: 'starter', autoRenew: true } as never)
    await expect(checkout(USER, 'starter', NOW, { autoRenewSetup: true })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})

describe('startSubscription (A2)', () => {
  it('creates a monthly Subscription from the saved card, first charge a day before the period ends', async () => {
    const periodEnd = new Date('2026-11-21T03:00:00Z')
    vi.mocked(midtrans.getStatus).mockResolvedValue({ ...charge(), saved_token_id: '48111111abc1114' })
    vi.mocked(midtrans.createSubscription).mockResolvedValue({ id: 'sub1', name: 'n', amount: '99000', status: 'active' })

    expect(await startSubscription(payment(), periodEnd)).toBe('sub1')

    expect(midtrans.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 99_000, token: '48111111abc1114', startAt: new Date('2026-11-20T03:00:00Z') }),
    )
    expect(userRepo.setAutoRenew).toHaveBeenCalledWith(USER, 'sub1')
  })

  it('leaves auto-renew off, and says so, when no card was saved', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(charge())
    expect(await startSubscription(payment(), new Date())).toBeNull()
    expect(midtrans.createSubscription).not.toHaveBeenCalled()
    expect(notificationService.onAutoRenewFailed).toHaveBeenCalledWith(USER, expect.objectContaining({ stopped: true }))
  })

  it('runs when the setup payment is activated', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue({ ...charge(), saved_token_id: 'tok' })
    vi.mocked(midtrans.createSubscription).mockResolvedValue({ id: 'sub1', name: 'n', amount: '99000', status: 'active' })
    await activate(payment(), NOW)
    expect(midtrans.createSubscription).toHaveBeenCalledOnce()
  })
})

describe('subscription notifications (A3, A4)', () => {
  const body = { event_name: 'subscription.charge', subscription: { id: 'sub1' }, transaction: { transaction_id: 'tx9', status_code: '200' } }
  const next = '2026-12-20T03:00:00.000000Z'

  beforeEach(() => {
    vi.mocked(userRepo.findBySubscriptionId).mockResolvedValue({ userId: USER, plan: 'starter', expiresAt: new Date(NOW.getTime() + DAY) })
    vi.mocked(midtrans.getSubscription).mockResolvedValue({ id: 'sub1', name: 'n', amount: '99000', status: 'active', merchant_id: 'G123', schedule: { next_execution_at: next, current_interval: 1 } })
    vi.mocked(midtrans.getStatus).mockResolvedValue(charge())
    vi.mocked(paymentRepo.insertSubscriptionCharge).mockImplementation(async (r) => ({ ...payment(), ...r }) as never)
  })

  it('A3: a confirmed charge extends the plan to a day after the next charge, once', async () => {
    expect(await handleSubscriptionNotification(body, NOW)).toBe('applied')

    expect(midtrans.getSubscription).toHaveBeenCalledWith('sub1') // the body is not believed
    expect(midtrans.getStatus).toHaveBeenCalledWith('tx9')
    const periodEnd = new Date(new Date(next).getTime() + DAY)
    expect(paymentRepo.insertSubscriptionCharge).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: 'sub1', amount: 99_000, periodEnd }))
    expect(userRepo.extendPaidPeriod).toHaveBeenCalledWith(USER, periodEnd)

    vi.mocked(paymentRepo.insertSubscriptionCharge).mockResolvedValue(undefined) // same charge again
    expect(await handleSubscriptionNotification(body, NOW)).toBe('unchanged')
    expect(userRepo.extendPaidPeriod).toHaveBeenCalledTimes(1)
  })

  it('ignores a subscription it does not know, without calling Midtrans', async () => {
    vi.mocked(userRepo.findBySubscriptionId).mockResolvedValue(undefined)
    expect(await handleSubscriptionNotification(body, NOW)).toBe('unknown_subscription')
    expect(midtrans.getSubscription).not.toHaveBeenCalled()
  })

  it('refuses a subscription that Midtrans says belongs to another merchant', async () => {
    vi.mocked(midtrans.getSubscription).mockResolvedValue({ id: 'sub1', name: 'n', amount: '99000', status: 'active', merchant_id: 'OTHER' })
    await expect(handleSubscriptionNotification(body, NOW)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('does not extend on a charge for the wrong amount', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(charge({ gross_amount: '1000.00' }))
    await handleSubscriptionNotification(body, NOW)
    expect(userRepo.extendPaidPeriod).not.toHaveBeenCalled()
  })

  it('A4: a declined charge tells the customer and leaves the plan; a stopped subscription turns auto-renew off', async () => {
    vi.mocked(midtrans.getStatus).mockResolvedValue(charge({ transaction_status: 'deny' }))
    await handleSubscriptionNotification(body, NOW)
    expect(notificationService.onAutoRenewFailed).toHaveBeenLastCalledWith(USER, expect.objectContaining({ stopped: false }))
    expect(userRepo.setAutoRenew).not.toHaveBeenCalled()
    expect(userRepo.extendPaidPeriod).not.toHaveBeenCalled()

    vi.mocked(midtrans.getSubscription).mockResolvedValue({ id: 'sub1', name: 'n', amount: '99000', status: 'inactive' })
    await handleSubscriptionNotification({ ...body, transaction: { transaction_id: undefined as never, status_code: '411' } }, NOW)
    expect(notificationService.onAutoRenewFailed).toHaveBeenLastCalledWith(USER, expect.objectContaining({ stopped: true }))
    expect(userRepo.setAutoRenew).toHaveBeenCalledWith(USER, null)
  })
})

describe('stop (A5)', () => {
  it('cancels the Subscription at Midtrans, then clears it here', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ id: USER, plan: 'starter', autoRenew: true, midtransSubscriptionId: 'sub1' } as never)
    await stop(USER)
    expect(midtrans.cancelSubscription).toHaveBeenCalledWith('sub1')
    expect(userRepo.setAutoRenew).toHaveBeenCalledWith(USER, null)
  })

  it('reports a failed cancel to the customer instead of pretending billing stopped', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ id: USER, plan: 'starter', autoRenew: true, midtransSubscriptionId: 'sub1' } as never)
    vi.mocked(midtrans.cancelSubscription).mockRejectedValue(Object.assign(new Error('x'), { code: 'PAYMENT_PROVIDER_ERROR' }))
    await expect(stop(USER)).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' })
    expect(userRepo.setAutoRenew).not.toHaveBeenCalled()
  })

  it('an upgrade to another plan cancels the old plan’s Subscription', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ id: USER, plan: 'starter', autoRenew: true, midtransSubscriptionId: 'sub1' } as never)
    await activate(payment({ plan: 'premium', amount: 1_490_000, autoRenewSetup: false }), NOW)
    expect(midtrans.cancelSubscription).toHaveBeenCalledWith('sub1')
  })
})
