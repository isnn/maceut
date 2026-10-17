/**
 * Paying for a plan with Midtrans Snap (FE-56).
 *
 * The flow, following Midtrans' Snap integration guide:
 *   1. checkout() writes a `creating` row, THEN asks Snap for a token, then marks it
 *      `pending`. The amount comes from PLAN_PRICE_IDR, never from the request.
 *   2. The browser opens the Snap popup with the token; Midtrans owns the payment UI.
 *   3. Midtrans' HTTP notification (handleNotification) is the source of truth. It is
 *      signature-checked, then the status is re-read with the Get Status API, and only
 *      that answer moves the row.
 *   4. The browser's Snap callbacks are UX hints. On success it calls sync() once,
 *      which makes the same Get Status check — so a slow notification doesn't leave the
 *      customer looking at the old plan.
 *
 * Steps 3 and 4 can race; payment.repository `transition()` lets exactly one of them
 * move the row, and only that one activates the plan.
 */
import { config, isMidtransConfigured } from '../config/env'
import { ForbiddenError, NotFoundError, PaymentsNotConfiguredError, ValidationError } from '../errors'
import * as midtrans from '../lib/midtrans-client'
import type { MidtransStatus } from '../lib/midtrans-client'
import * as paymentRepo from '../repositories/payment.repository'
import * as userRepo from '../repositories/user.repository'
import * as planChangeRepo from '../repositories/plan-change.repository'
import * as planService from './plan.service'
import * as notificationService from './notification.service'
import { accessOf } from '../lib/internal-access'
import { PAID_PERIOD_DAYS, PLAN_PRICE_IDR, PLANS, planRank, type Plan } from '../types/plan'
import type { PaymentRow } from '../../drizzle/schema'

const DAY_MS = 86_400_000
/** How long a Snap page stays payable (VA needs hours, not minutes). */
export const PAYMENT_WINDOW_HOURS = 24
/** Reopen an existing pending payment only while it is comfortably inside that window. */
const REUSE_WITHIN_MS = (PAYMENT_WINDOW_HOURS - 1) * 60 * 60 * 1000

const PLAN_NAME: Record<Plan, string> = { free: 'Free', starter: 'Starter', standard: 'Standard', premium: 'Premium' }

export interface PaymentView {
  orderId: string
  plan: Plan
  amount: number
  status: PaymentRow['status']
  /** Only while pending: what the browser needs to reopen the Snap popup. */
  snapToken: string | null
  redirectUrl: string | null
  paymentType: string | null
  paidAt: string | null
  periodEnd: string | null
  createdAt: string
}

export function toView(row: PaymentRow): PaymentView {
  const open = row.status === 'pending'
  return {
    orderId: row.orderId,
    plan: row.plan,
    amount: row.amount,
    status: row.status,
    snapToken: open ? row.snapToken : null,
    redirectUrl: open ? row.redirectUrl : null,
    paymentType: row.paymentType,
    paidAt: row.paidAt?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** What the Profile page needs to label its buttons. */
export function prices(): { enabled: boolean; prices: Record<Plan, number>; periodDays: number } {
  return { enabled: isMidtransConfigured(), prices: { ...PLAN_PRICE_IDR }, periodDays: PAID_PERIOD_DAYS }
}

/** Midtrans allows 50 characters of letters, digits, `-`, `_`, `~` and `.`. */
export function newOrderId(userId: string, now: Date): string {
  const who = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'acct'
  return `MCT-${who}-${now.getTime()}`
}

export interface CheckoutResult {
  orderId: string
  token: string
  redirectUrl: string
  amount: number
  plan: Plan
  /** True when this reopens a payment the customer had already started. */
  reused: boolean
}

export async function checkout(userId: string, plan: Plan, now: Date = new Date()): Promise<CheckoutResult> {
  if (!isMidtransConfigured()) throw new PaymentsNotConfiguredError()
  if (!PLANS.includes(plan) || plan === 'free') throw new ValidationError('Choose a paid plan.')

  const account = await userRepo.findByIdWithPlan(userId)
  if (!account) throw new NotFoundError('User')
  // Staff have no customer plan (FE-34); their access is their staff type.
  if (accessOf(account) !== 'user') throw new ForbiddenError('Staff accounts have no plan to pay for.')
  if (planRank(plan) < planRank(account.plan)) {
    throw new ValidationError(`To move down to ${PLAN_NAME[plan]}, use Change plan — there is nothing to pay.`)
  }
  if (plan === account.plan) {
    // A renewal only makes sense for a paid period. A plan staff set has no end date,
    // and paying would turn it into one that runs out in 30 days.
    const planRow = await userRepo.findPlanRow(userId)
    if (!planRow?.expiresAt) throw new ValidationError(`Your ${PLAN_NAME[plan]} plan has no end date, so there is nothing to renew.`)
  }

  const open = await paymentRepo.findPendingSince(userId, plan, new Date(now.getTime() - REUSE_WITHIN_MS))
  if (open?.snapToken && open.redirectUrl) {
    return { orderId: open.orderId, token: open.snapToken, redirectUrl: open.redirectUrl, amount: open.amount, plan, reused: true }
  }

  const amount = PLAN_PRICE_IDR[plan]
  const orderId = newOrderId(userId, now)
  // Recorded before Midtrans is called: if the call fails, the row still says so.
  await paymentRepo.create({ userId, orderId, plan, amount })

  let snap: midtrans.SnapTransaction
  try {
    snap = await midtrans.createSnapTransaction({
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{ id: plan, price: amount, quantity: 1, name: `Maceut ${PLAN_NAME[plan]}, ${PAID_PERIOD_DAYS} days` }],
      customer_details: { first_name: account.name || undefined, email: account.email },
      // No enabled_payments: Snap offers every method active in the dashboard's Snap
      // Preference. Cards always go through 3-D Secure.
      credit_card: { secure: true },
      expiry: { duration: PAYMENT_WINDOW_HOURS, unit: 'hours' },
      callbacks: { finish: `${config.frontendUrl}/profile?payment=${encodeURIComponent(orderId)}` },
    })
  } catch (err) {
    await paymentRepo.transition(orderId, 'failed', { providerStatus: 'snap_error' })
    throw err
  }

  await paymentRepo.markPending(orderId, snap.token, snap.redirect_url)
  console.log(`[payments] checkout ${orderId}: ${plan} ${amount}`)
  return { orderId, token: snap.token, redirectUrl: snap.redirect_url, amount, plan, reused: false }
}

export type NotificationResult = 'applied' | 'unchanged' | 'unknown_order' | 'no_transaction'

/**
 * Midtrans' HTTP notification. Throws ForbiddenError (→ 403) when it isn't genuinely
 * from Midtrans; anything else it returns is a 200, so Midtrans stops retrying.
 */
export async function handleNotification(body: Partial<MidtransStatus>): Promise<NotificationResult> {
  if (!isMidtransConfigured()) throw new PaymentsNotConfiguredError()
  if (!midtrans.verifySignature(body as MidtransStatus)) {
    console.warn(`[payments] notification ${body.order_id ?? '?'}: bad signature`)
    throw new ForbiddenError('Invalid notification signature.')
  }
  if (config.midtransMerchantId && body.merchant_id && body.merchant_id !== config.midtransMerchantId) {
    console.warn(`[payments] notification ${body.order_id}: other merchant`)
    throw new ForbiddenError('Notification for another merchant.')
  }

  const orderId = body.order_id!
  const payment = await paymentRepo.findByOrderId(orderId)
  if (!payment) {
    console.warn(`[payments] notification ${orderId}: no such order here`)
    return 'unknown_order'
  }

  // The notification says something happened; the Get Status API says what.
  const status = await midtrans.getStatus(orderId)
  if (!status) return 'no_transaction'
  console.log(`[payments] notification ${orderId}: ${status.transaction_status}${status.fraud_status ? `/${status.fraud_status}` : ''}`)
  return (await apply(payment, status)) ? 'applied' : 'unchanged'
}

/**
 * The browser's check after the Snap popup reports success, or on the finish redirect.
 * Same Get Status lookup as a notification, for the owner's own payment only.
 */
export async function sync(userId: string, orderId: string, now: Date = new Date()): Promise<PaymentView> {
  const payment = await paymentRepo.findByOrderId(orderId)
  if (!payment || payment.userId !== userId) throw new NotFoundError('Payment')
  if (payment.status !== 'creating' && payment.status !== 'pending') return toView(payment)
  if (!isMidtransConfigured()) return toView(payment)

  const status = await midtrans.getStatus(orderId)
  if (status) await apply(payment, status, now)
  return toView((await paymentRepo.findByOrderId(orderId)) ?? payment)
}

/** The account's open payment, for "Continue payment". */
export async function pending(userId: string, now: Date = new Date()): Promise<PaymentView | null> {
  const row = await paymentRepo.findOpenSince(userId, new Date(now.getTime() - REUSE_WITHIN_MS))
  return row ? toView(row) : null
}

/** The account's payments, newest first, for the Billing tab. Open ones keep their token. */
export async function history(userId: string): Promise<PaymentView[]> {
  return (await paymentRepo.listByUser(userId)).map(toView)
}

/** Moves the row by what Midtrans says. True when this call changed something. */
async function apply(payment: PaymentRow, s: MidtransStatus, now: Date = new Date()): Promise<boolean> {
  const fields = {
    providerStatus: s.transaction_status,
    paymentType: s.payment_type ?? null,
    transactionId: s.transaction_id ?? null,
  }
  const outcome = midtrans.outcomeOf(s.transaction_status, s.fraud_status)

  if (outcome === null) {
    await paymentRepo.noteProviderStatus(payment.orderId, fields)
    return false
  }

  if (outcome === 'paid') {
    if (!midtrans.amountMatches(s.gross_amount, payment.amount)) {
      console.error(`[payments] ${payment.orderId}: paid ${s.gross_amount}, expected ${payment.amount} — not activated`)
      await paymentRepo.noteProviderStatus(payment.orderId, { ...fields, providerStatus: `amount_mismatch:${s.transaction_status}` })
      return false
    }
    const moved = await paymentRepo.transition(payment.orderId, 'paid', { ...fields, paidAt: now })
    if (!moved) return false
    await activate(moved, now)
    return true
  }

  if (outcome === 'refunded') {
    const moved = await paymentRepo.markRefunded(payment.orderId, fields)
    if (moved) console.warn(`[payments] ${payment.orderId}: refunded — plan left as is for staff`)
    return Boolean(moved)
  }

  return Boolean(await paymentRepo.transition(payment.orderId, outcome, fields))
}

/**
 * Puts the paid plan in place for 30 days. Runs once per payment: only the caller that
 * won `transition(..., 'paid')` gets here.
 *
 * A renewal (same plan, time left) adds 30 days to the current end; anything else
 * starts 30 days from now. Moving up never resumes what is paused — that stays the
 * customer's call (plan.service applyPlanChange).
 */
export async function activate(payment: PaymentRow, now: Date = new Date()): Promise<Date> {
  const account = await userRepo.findByIdWithPlan(payment.userId)
  const planRow = await userRepo.findPlanRow(payment.userId)
  const from = account?.plan ?? 'free'
  const renewal = from === payment.plan && planRow?.expiresAt != null && planRow.expiresAt > now

  const base = renewal ? planRow!.expiresAt! : now
  const periodEnd = new Date(base.getTime() + PAID_PERIOD_DAYS * DAY_MS)

  await userRepo.setPlan(payment.userId, payment.plan, { expiresAt: periodEnd, keepStartedAt: renewal })
  await paymentRepo.setPeriodEnd(payment.id, periodEnd)
  const impact = await planService.applyPlanChange(payment.userId, payment.plan)
  await planChangeRepo.record({ userId: payment.userId, fromPlan: from, toPlan: payment.plan, source: 'payment' })
  await notificationService.onPaymentActivated(payment.userId, {
    orderId: payment.orderId,
    from,
    to: payment.plan,
    periodEnd,
    paused: [...impact.zonesToPause, ...impact.schedulesToPause].map((i) => i.name),
  })
  console.log(`[payments] ${payment.orderId}: ${payment.plan} active until ${periodEnd.toISOString()}`)
  return periodEnd
}
