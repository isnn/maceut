import { and, desc, eq, gt, inArray } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { payments, type PaymentRow, type PaymentStatus } from '../../drizzle/schema'
import type { Plan } from '../types/plan'

/** The only statuses a payment can leave. Everything else is final. */
const OPEN: PaymentStatus[] = ['creating', 'pending']

export async function create(input: {
  userId: string
  orderId: string
  plan: Plan
  amount: number
  autoRenewSetup?: boolean
}): Promise<PaymentRow> {
  const [row] = await db.insert(payments).values({ ...input, status: 'creating' }).returning()
  return row!
}

export async function findByOrderId(orderId: string): Promise<PaymentRow | undefined> {
  const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1)
  return row
}

/** The account's newest `pending` payment for `plan` created after `since`, to reopen instead of starting another. */
export async function findPendingSince(
  userId: string,
  plan: Plan,
  since: Date,
  autoRenewSetup = false,
): Promise<PaymentRow | undefined> {
  const [row] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.plan, plan),
        eq(payments.status, 'pending'),
        eq(payments.autoRenewSetup, autoRenewSetup),
        gt(payments.createdAt, since),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1)
  return row
}

/** The account's newest `pending` payment created after `since`, whatever the plan — the "Continue payment" banner. */
export async function findOpenSince(userId: string, since: Date): Promise<PaymentRow | undefined> {
  const [row] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.userId, userId), eq(payments.status, 'pending'), gt(payments.createdAt, since)))
    .orderBy(desc(payments.createdAt))
    .limit(1)
  return row
}

/** `creating` → `pending`, once Snap has issued a token. */
export async function markPending(orderId: string, snapToken: string, redirectUrl: string): Promise<PaymentRow | undefined> {
  const [row] = await db
    .update(payments)
    .set({ status: 'pending', snapToken, redirectUrl, updatedAt: new Date() })
    .where(and(eq(payments.orderId, orderId), eq(payments.status, 'creating')))
    .returning()
  return row
}

export interface ProviderFields {
  providerStatus?: string | null
  paymentType?: string | null
  transactionId?: string | null
}

/**
 * Moves an open payment (`creating` / `pending`) to `to`, and returns it — or
 * `undefined` when it had already left those states. That conditional update is the
 * whole idempotency story: two notifications for one settlement, or a notification
 * racing the browser's status check, can both call this, and exactly one gets the row
 * back and goes on to activate the plan. A late `expire` after `paid` changes nothing.
 */
export async function transition(
  orderId: string,
  to: Exclude<PaymentStatus, 'creating' | 'pending' | 'refunded'>,
  fields: ProviderFields & { paidAt?: Date } = {},
): Promise<PaymentRow | undefined> {
  const [row] = await db
    .update(payments)
    .set({ ...fields, status: to, updatedAt: new Date() })
    .where(and(eq(payments.orderId, orderId), inArray(payments.status, OPEN)))
    .returning()
  return row
}

/** `paid` → `refunded`. Recorded only; the plan is left to staff. */
export async function markRefunded(orderId: string, fields: ProviderFields = {}): Promise<PaymentRow | undefined> {
  const [row] = await db
    .update(payments)
    .set({ ...fields, status: 'refunded', updatedAt: new Date() })
    .where(and(eq(payments.orderId, orderId), eq(payments.status, 'paid')))
    .returning()
  return row
}

/** Keeps Midtrans' latest status on an open row without moving it (a `pending` notification, a challenged card). */
export async function noteProviderStatus(orderId: string, fields: ProviderFields): Promise<void> {
  await db
    .update(payments)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(payments.orderId, orderId), inArray(payments.status, OPEN)))
}

/** The period end of an activated payment, written once the plan is moved. */
export async function setPeriodEnd(id: string, periodEnd: Date): Promise<void> {
  await db.update(payments).set({ periodEnd, updatedAt: new Date() }).where(eq(payments.id, id))
}

/**
 * One charge a Midtrans Subscription made, recorded as paid. Keyed by Midtrans' own
 * order_id for that charge, so a repeated notification inserts nothing and returns
 * `undefined` — exactly one caller extends the plan.
 */
export async function insertSubscriptionCharge(input: {
  userId: string
  orderId: string
  plan: Plan
  amount: number
  subscriptionId: string
  paidAt: Date
  periodEnd: Date
} & ProviderFields): Promise<PaymentRow | undefined> {
  const [row] = await db
    .insert(payments)
    .values({ ...input, status: 'paid' })
    .onConflictDoNothing({ target: payments.orderId })
    .returning()
  return row
}

/** Newest first, for the account's billing history. */
export async function listByUser(userId: string, limit = 50): Promise<PaymentRow[]> {
  return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)).limit(limit)
}
