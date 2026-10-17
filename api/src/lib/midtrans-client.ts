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
