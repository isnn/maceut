/**
 * Auto-renew (FE-56 phase 5, off by default): a Midtrans card Subscription renews the
 * plan every month.
 *
 * - Turning it on is a card-only Snap payment with `save_card` (payment.service
 *   `checkout(..., { autoRenewSetup: true })`). Once that payment is confirmed,
 *   `startSubscription` reads the saved card token from Get Status and creates the
 *   Subscription, its first charge one day before the period ends.
 * - Midtrans owns the schedule. This app never charges a saved card itself, so there is
 *   exactly one thing that can bill the customer.
 * - Each charge arrives as a subscription notification. Those carry no signature, so
 *   nothing in the body is believed: the subscription is read back with
 *   GET /v1/subscriptions/{id} and the charge with Get Status before anything changes.
 * - A changed plan, a downgrade, an expiry or a deleted account cancels the subscription.
 *
 * While it is on, an account's paid period is honoured for RETRY_DAYS past its end date
 * (plan-expiry), so Midtrans' daily retries of a declined card don't drop it to Free in
 * between.
 */
import { config } from '../config/env'
import { ForbiddenError } from '../errors'
import * as midtrans from '../lib/midtrans-client'
import * as paymentRepo from '../repositories/payment.repository'
import * as userRepo from '../repositories/user.repository'
import * as planChangeRepo from '../repositories/plan-change.repository'
import * as notificationService from './notification.service'
import { PAID_PERIOD_DAYS, PLAN_PRICE_IDR } from '../types/plan'
import type { PaymentRow } from '../../drizzle/schema'

const DAY_MS = 86_400_000
/** Midtrans retries a declined renewal daily, this many times. */
export const RETRY_DAYS = 3
/** The first automatic charge happens this long before the paid period ends. */
const CHARGE_AHEAD_MS = DAY_MS

export function isAutoRenewEnabled(): boolean {
  return Boolean(config.midtransServerKey) && config.midtransAutoRenewEnabled
}

/**
 * After the setup payment is confirmed and the plan extended to `periodEnd`: create the
 * Subscription from the card Midtrans saved. Failure here leaves auto-renew off and says
 * so — the payment itself already counted.
 */
export async function startSubscription(payment: PaymentRow, periodEnd: Date): Promise<string | null> {
  const fail = async (why: string) => {
    console.error(`[auto-renew] ${payment.orderId}: ${why}`)
    await notificationService.onAutoRenewFailed(payment.userId, { plan: payment.plan, stopped: true, dedupe: `setup:${payment.orderId}` })
    return null
  }
  try {
    const status = await midtrans.getStatus(payment.orderId)
    const token = status?.saved_token_id
    if (!token) return await fail('no saved card token on the payment')

    const account = await userRepo.findByIdWithPlan(payment.userId)
    const sub = await midtrans.createSubscription({
      name: `MCT-SUB-${payment.orderId.replace(/^MCT-/, '')}`,
      amount: PLAN_PRICE_IDR[payment.plan],
      token,
      startAt: new Date(periodEnd.getTime() - CHARGE_AHEAD_MS),
      customer: { first_name: account?.name || undefined, email: account?.email ?? '' },
      metadata: { userId: payment.userId, plan: payment.plan },
    })
    await userRepo.setAutoRenew(payment.userId, sub.id)
    console.log(`[auto-renew] ${payment.userId}: subscription ${sub.id} for ${payment.plan}`)
    return sub.id
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

/**
 * Turns auto-renew off: cancels the Subscription at Midtrans first, then clears it here.
 * A cancel that fails is logged and the local switch still goes off — but the error is
 * re-thrown for the customer-facing switch, so nobody believes billing stopped when it
 * may not have.
 */
export async function stop(userId: string, opts: { quiet?: boolean } = {}): Promise<void> {
  const account = await userRepo.findByIdWithPlan(userId)
  const subId = account?.midtransSubscriptionId
  if (!subId) {
    if (account?.autoRenew) await userRepo.setAutoRenew(userId, null)
    return
  }
  try {
    await midtrans.cancelSubscription(subId)
  } catch (err) {
    console.error(`[auto-renew] ${userId}: cancel ${subId} failed:`, err instanceof Error ? err.message : err)
    if (!opts.quiet) throw err
  }
  await userRepo.setAutoRenew(userId, null)
  console.log(`[auto-renew] ${userId}: subscription ${subId} cancelled`)
}

/** `stop` for side paths (plan changed, expired, account deleted): never blocks them. */
export async function stopQuietly(userId: string): Promise<void> {
  try {
    await stop(userId, { quiet: true })
  } catch (err) {
    console.error(`[auto-renew] ${userId}: stop failed:`, err instanceof Error ? err.message : err)
  }
}

export type SubscriptionNotificationResult = 'applied' | 'unchanged' | 'unknown_subscription'

interface SubscriptionNotification {
  event_name?: string
  subscription?: { id?: string; schedule?: { current_interval?: number; next_execution_at?: string } }
  transaction?: { transaction_id?: string; status_code?: string }
}

/** A `subscription.*` notification. Authenticated by reading it back from Midtrans. */
export async function handleSubscriptionNotification(body: SubscriptionNotification, now: Date = new Date()): Promise<SubscriptionNotificationResult> {
  const subId = body.subscription?.id
  if (!subId) return 'unknown_subscription'
  const owner = await userRepo.findBySubscriptionId(subId)
  if (!owner) {
    console.warn(`[auto-renew] notification for unknown subscription ${subId}`)
    return 'unknown_subscription'
  }

  // Throws for a subscription Midtrans doesn't know under our key — a forged notification.
  const sub = await midtrans.getSubscription(subId)
  if (config.midtransMerchantId && sub.merchant_id && sub.merchant_id !== config.midtransMerchantId) {
    throw new ForbiddenError('Notification for another merchant.')
  }

  const txId = body.transaction?.transaction_id
  const charge = txId ? await midtrans.getStatus(txId) : null
  const outcome = charge ? midtrans.outcomeOf(charge.transaction_status, charge.fraud_status) : 'failed'
  const amount = PLAN_PRICE_IDR[owner.plan]

  if (charge && outcome === 'paid' && midtrans.amountMatches(charge.gross_amount, amount)) {
    const next = sub.schedule?.next_execution_at ? new Date(sub.schedule.next_execution_at) : null
    const base = owner.expiresAt && owner.expiresAt > now ? owner.expiresAt : now
    // Paid until a day after the next charge, so that charge lands inside the period.
    const periodEnd = next && !Number.isNaN(next.getTime()) ? new Date(next.getTime() + CHARGE_AHEAD_MS) : new Date(base.getTime() + PAID_PERIOD_DAYS * DAY_MS)

    const row = await paymentRepo.insertSubscriptionCharge({
      userId: owner.userId,
      orderId: charge.order_id,
      plan: owner.plan,
      amount,
      subscriptionId: subId,
      paidAt: now,
      periodEnd,
      providerStatus: charge.transaction_status,
      paymentType: charge.payment_type ?? 'credit_card',
      transactionId: charge.transaction_id ?? txId ?? null,
    })
    if (!row) return 'unchanged' // this charge was already counted
    await userRepo.extendPaidPeriod(owner.userId, periodEnd)
    await planChangeRepo.record({ userId: owner.userId, fromPlan: owner.plan, toPlan: owner.plan, source: 'payment' })
    await notificationService.onPaymentActivated(owner.userId, { orderId: row.orderId, from: owner.plan, to: owner.plan, periodEnd, paused: [] })
    console.log(`[auto-renew] ${owner.userId}: charged ${charge.order_id}, ${owner.plan} until ${periodEnd.toISOString()}`)
    return 'applied'
  }

  if (charge && outcome === null) return 'unchanged' // still processing / under review

  // Declined, or no transaction at all (Midtrans' 4xx/5xx charge attempts carry none).
  const stopped = sub.status !== 'active'
  await notificationService.onAutoRenewFailed(owner.userId, {
    plan: owner.plan,
    stopped,
    dedupe: `${subId}:${sub.schedule?.current_interval ?? body.subscription?.schedule?.current_interval ?? '?'}:${sub.schedule?.next_execution_at ?? txId ?? ''}${stopped ? ':stopped' : ''}`,
  })
  if (stopped) await userRepo.setAutoRenew(owner.userId, null)
  console.warn(`[auto-renew] ${owner.userId}: charge failed${stopped ? ', subscription stopped' : ''}`)
  return 'applied'
}
