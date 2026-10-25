import { createHash, timingSafeEqual } from 'node:crypto'
import { config, isMidtransConfigured } from '../config/env'
import { PaymentProviderError, PaymentsNotConfiguredError } from '../errors'

/**
 * Midtrans, server side (FE-56): Snap token creation, the Core status lookup and the
 * notification signature. A thin `fetch` wrapper rather than the official SDK, which
 * would be a new dependency for three calls.
 *
 * Two host families, never mixed: Snap lives on `app.*`, the Core API (status) on
 * `api.*`. Each has a sandbox twin, chosen by MIDTRANS_IS_PRODUCTION, which must match
 * the key — a sandbox key against a production host is a 401.
 *
 * Nothing here logs a key, a token or a full payload: only order ids and statuses.
 */

const TIMEOUT_MS = 10_000

export function hosts(production = config.midtransIsProduction): { snap: string; core: string } {
  return production
    ? { snap: 'https://app.midtrans.com', core: 'https://api.midtrans.com' }
    : { snap: 'https://app.sandbox.midtrans.com', core: 'https://api.sandbox.midtrans.com' }
}

function serverKey(): string {
  if (!isMidtransConfigured()) throw new PaymentsNotConfiguredError()
  return config.midtransServerKey!
}

/** Basic auth with the server key as the user and an empty password. */
function headers(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`${serverKey()}:`).toString('base64')}`,
  }
}

// --- Snap -----------------------------------------------------------------------------

export interface SnapTransactionRequest {
  transaction_details: { order_id: string; gross_amount: number }
  /** Required by Snap to save a card (`credit_card.save_card`). */
  user_id?: string
  item_details: { id: string; price: number; quantity: number; name: string }[]
  customer_details?: { first_name?: string; email?: string }
  enabled_payments?: string[]
  credit_card?: { secure: boolean; save_card?: boolean }
  expiry?: { duration: number; unit: 'minute' | 'minutes' | 'hour' | 'hours' | 'day' | 'days' }
  callbacks?: { finish: string }
}

export interface SnapTransaction {
  token: string
  redirect_url: string
}

/** POST /snap/v1/transactions. `gross_amount` must be an integer and equal the items' total. */
export async function createSnapTransaction(body: SnapTransactionRequest): Promise<SnapTransaction> {
  const orderId = body.transaction_details.order_id
  // Outside the try: a missing key is our configuration, not the provider failing.
  const auth = headers()
  let res: Response
  try {
    res = await fetch(`${hosts().snap}/snap/v1/transactions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error(`[midtrans] snap ${orderId}: request failed:`, err instanceof Error ? err.message : err)
    throw new PaymentProviderError()
  }
  if (!res.ok) {
    console.error(`[midtrans] snap ${orderId}: HTTP ${res.status}`)
    throw new PaymentProviderError(res.status)
  }
  const data = (await res.json()) as Partial<SnapTransaction>
  if (!data.token || !data.redirect_url) {
    console.error(`[midtrans] snap ${orderId}: no token in the response`)
    throw new PaymentProviderError(res.status)
  }
  return { token: data.token, redirect_url: data.redirect_url }
}

// --- Core status ----------------------------------------------------------------------

/** The fields of a status response (and of a notification) this app reads. */
export interface MidtransStatus {
  order_id: string
  status_code: string
  gross_amount: string
  transaction_status: string
  fraud_status?: string
  payment_type?: string
  transaction_id?: string
  merchant_id?: string
  signature_key?: string
  /** Card payments made with `save_card`: the token a Subscription charges. */
  saved_token_id?: string
  saved_token_id_expired_at?: string
}

/**
 * GET /v2/{order_id}/status. `null` when Midtrans has no transaction for the order —
 * normal for a Snap order whose customer hasn't picked a method yet, so not an error.
 * Midtrans reports that as a 404, in the HTTP status or in the body's `status_code`.
 */
export async function getStatus(orderId: string): Promise<MidtransStatus | null> {
  const auth = headers()
  let res: Response
  try {
    res = await fetch(`${hosts().core}/v2/${encodeURIComponent(orderId)}/status`, {
      headers: auth,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error(`[midtrans] status ${orderId}: request failed:`, err instanceof Error ? err.message : err)
    throw new PaymentProviderError()
  }
  if (res.status === 404) return null
  if (!res.ok) {
    console.error(`[midtrans] status ${orderId}: HTTP ${res.status}`)
    throw new PaymentProviderError(res.status)
  }
  const data = (await res.json()) as Partial<MidtransStatus>
  if (data.status_code === '404') return null
  if (data.status_code === '401') {
    console.error(`[midtrans] status ${orderId}: key refused`)
    throw new PaymentProviderError(401)
  }
  return data as MidtransStatus
}

/**
 * POST /v2/{order_id}/cancel — stops a pending payment (a VA, QRIS, e-wallet or store
 * code the customer chose) so it can no longer be paid. Used when the customer wants
 * another method: a Snap order is tied to the method picked first.
 *
 * `cancelled`: done. `no_transaction`: no method was picked yet, nothing to stop.
 * `not_cancellable` (412): it is already final at Midtrans — paid, expired — so the
 * caller re-reads the status instead.
 */
export type CancelResult = 'cancelled' | 'no_transaction' | 'not_cancellable'

export async function cancelTransaction(orderId: string): Promise<CancelResult> {
  const auth = headers()
  let res: Response
  try {
    res = await fetch(`${hosts().core}/v2/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      headers: auth,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error(`[midtrans] cancel ${orderId}: request failed:`, err instanceof Error ? err.message : err)
    throw new PaymentProviderError()
  }
  // Core API puts the real answer in the body's status_code, sometimes under HTTP 200.
  const data = (await res.json().catch(() => ({}))) as { status_code?: string }
  const code = Number(data.status_code ?? res.status)
  if (code === 200) return 'cancelled'
  if (code === 404) return 'no_transaction'
  if (code === 412) return 'not_cancellable'
  console.error(`[midtrans] cancel ${orderId}: status ${code}`)
  throw new PaymentProviderError(code)
}

// --- Notifications --------------------------------------------------------------------

/**
 * SHA512(order_id + status_code + gross_amount + server key), compared in constant time.
 *
 * `gross_amount` must be the string exactly as Midtrans sent it ("99000.00"). Parsing it
 * into a number and back is the classic way to make every genuine notification fail.
 */
export function verifySignature(
  n: Pick<MidtransStatus, 'order_id' | 'status_code' | 'gross_amount' | 'signature_key'>,
  key: string = serverKey(),
): boolean {
  if (!n.signature_key || !n.order_id || !n.status_code || !n.gross_amount) return false
  const expected = createHash('sha512').update(`${n.order_id}${n.status_code}${n.gross_amount}${key}`).digest('hex')
  const given = Buffer.from(n.signature_key.toLowerCase(), 'utf8')
  const want = Buffer.from(expected, 'utf8')
  return given.length === want.length && timingSafeEqual(given, want)
}

/** What a Midtrans status means for the payment row. `null`: nothing to change yet. */
export type PaymentOutcome = 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded'

/**
 * One rule for notifications and status lookups alike:
 * - `settlement` → paid; `capture` → paid only when the fraud check accepted it.
 *   A `challenge` waits for review, like `pending`.
 * - `deny` and `failure` → failed; `cancel` → cancelled; `expire` → expired.
 * - `refund` / `partial_refund` → refunded (recorded; the plan isn't changed).
 * Unknown statuses change nothing, so a new Midtrans status can't mark anything paid.
 */
export function outcomeOf(transactionStatus: string, fraudStatus?: string): PaymentOutcome | null {
  switch (transactionStatus) {
    case 'settlement':
      return 'paid'
    case 'capture':
      return fraudStatus === 'accept' ? 'paid' : null
    case 'deny':
    case 'failure':
      return 'failed'
    case 'cancel':
      return 'cancelled'
    case 'expire':
      return 'expired'
    case 'refund':
    case 'partial_refund':
      return 'refunded'
    default:
      return null
  }
}

/** Midtrans sends amounts as "99000.00"; true when that is exactly `amount` rupiah. */
export function amountMatches(grossAmount: string, amount: number): boolean {
  const n = Number(grossAmount)
  return Number.isFinite(n) && Math.round(n * 100) === amount * 100
}

// --- Subscriptions (auto-renew, FE-56 phase 5) ------------------------------------------

export interface MidtransSubscription {
  id: string
  name: string
  amount: string
  status: 'active' | 'inactive' | string
  token?: string
  merchant_id?: string
  schedule?: { next_execution_at?: string; current_interval?: number }
}

/** "2026-11-16 10:00:00 +0700" — the only time format the Subscription API accepts. */
export function subscriptionTime(d: Date): string {
  const wib = new Date(d.getTime() + 7 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${wib.getUTCFullYear()}-${p(wib.getUTCMonth() + 1)}-${p(wib.getUTCDate())} ${p(wib.getUTCHours())}:${p(wib.getUTCMinutes())}:${p(wib.getUTCSeconds())} +0700`
}

async function subscriptionCall<T>(path: string, init: RequestInit, label: string): Promise<T> {
  const auth = headers()
  let res: Response
  try {
    res = await fetch(`${hosts().core}${path}`, { ...init, headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    console.error(`[midtrans] ${label}: request failed:`, err instanceof Error ? err.message : err)
    throw new PaymentProviderError()
  }
  if (!res.ok) {
    console.error(`[midtrans] ${label}: HTTP ${res.status}`)
    throw new PaymentProviderError(res.status)
  }
  return (await res.json()) as T
}

/**
 * POST /v1/subscriptions — Midtrans then charges the saved card on its own schedule.
 * `amount` is a string here (unlike Snap's integer). `name` must be unique per merchant.
 */
export async function createSubscription(input: {
  name: string
  amount: number
  token: string
  startAt: Date
  customer: { first_name?: string; email: string }
  metadata: Record<string, string>
}): Promise<MidtransSubscription> {
  return subscriptionCall<MidtransSubscription>(
    '/v1/subscriptions',
    {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        amount: String(input.amount),
        currency: 'IDR',
        payment_type: 'credit_card',
        token: input.token,
        schedule: { interval: 1, interval_unit: 'month', start_time: subscriptionTime(input.startAt) },
        // A declined renewal is retried daily for 3 days before the subscription gives up.
        retry_schedule: { interval: 1, interval_unit: 'day', max_interval: 3 },
        metadata: input.metadata,
        customer_details: input.customer,
      }),
    },
    `subscription create ${input.name}`,
  )
}

/** GET /v1/subscriptions/{id}. Also how a subscription notification is authenticated: it carries no signature. */
export async function getSubscription(id: string): Promise<MidtransSubscription> {
  return subscriptionCall<MidtransSubscription>(`/v1/subscriptions/${encodeURIComponent(id)}`, { method: 'GET' }, `subscription get ${id}`)
}

/** POST /v1/subscriptions/{id}/cancel — final; turning auto-renew on again creates a new one. */
export async function cancelSubscription(id: string): Promise<void> {
  await subscriptionCall<unknown>(`/v1/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST' }, `subscription cancel ${id}`)
}
