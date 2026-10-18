import { apiClient } from '@/lib/api-client'
import type { Plan } from '@/features/auth/types'

/** FE-56. Mirrors api/src/services/payment.service.ts `PaymentView`. */
export type PaymentStatus = 'creating' | 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded'

export interface Payment {
  orderId: string
  plan: Plan
  amount: number
  status: PaymentStatus
  /** Only while pending: reopens the Snap popup. */
  snapToken: string | null
  redirectUrl: string | null
  paymentType: string | null
  paidAt: string | null
  periodEnd: string | null
  createdAt: string
}

export interface Prices {
  /** False until the server has a Midtrans key: the page keeps "Contact us to upgrade". */
  enabled: boolean
  /** The Auto-renew switch is offered (card + Midtrans Subscription; off on the server by default). */
  autoRenewAvailable: boolean
  prices: Record<Plan, number>
  periodDays: number
  /** A renewal may not end later than this many days from now (six periods). */
  maxAheadDays?: number
}

export interface Checkout {
  orderId: string
  token: string
  redirectUrl: string
  amount: number
  plan: Plan
  reused: boolean
}

export const getPrices = () => apiClient.get<Prices>('/payments/prices')
export const checkout = (plan: Plan) => apiClient.post<Checkout>('/payments/checkout', { plan })
/** One status check; the server confirms with Midtrans and may activate the plan. */
export const getPayment = (orderId: string) => apiClient.get<Payment>(`/payments/${encodeURIComponent(orderId)}`)
export const getPending = () => apiClient.get<Payment | null>('/payments/pending')
export const getHistory = () => apiClient.get<Payment[]>('/payments/history')
/** Card-only checkout that saves the card; once paid, Midtrans renews monthly. */
export const enableAutoRenew = (plan: Plan) => apiClient.post<Checkout>('/payments/auto-renew', { plan })
/**
 * "Change payment method" on an open payment. `checkout` is the Snap page to open — the
 * same one when no method was picked yet, otherwise a new order (the old method is
 * cancelled at Midtrans first). Null when the payment had already finished.
 */
export const changeMethod = (orderId: string) =>
  apiClient.post<{ payment: Payment; checkout: Checkout | null }>(`/payments/${encodeURIComponent(orderId)}/change-method`)

/** Saves the PDF invoice of a paid payment. */
export async function downloadInvoice(orderId: string): Promise<void> {
  const { blob, filename } = await apiClient.download(`/payments/${encodeURIComponent(orderId)}/invoice`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `maceut-invoice-${orderId}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const disableAutoRenew = () => apiClient.delete<{ autoRenew: false }>('/payments/auto-renew')

/** "Rp 99,000" — the same separator convention as formatNumber. */
export function formatRupiah(amount: number): string {
  return `Rp ${new Intl.NumberFormat('en-US').format(amount)}`
}

/** Midtrans' payment_type, as a customer would name it. */
export function paymentTypeLabel(type: string | null): string {
  if (!type) return '—'
  const known: Record<string, string> = {
    qris: 'QRIS',
    gopay: 'GoPay',
    shopeepay: 'ShopeePay',
    bank_transfer: 'Bank transfer',
    echannel: 'Mandiri Bill',
    credit_card: 'Card',
    cstore: 'Convenience store',
    akulaku: 'Akulaku',
    kredivo: 'Kredivo',
    dana: 'DANA',
  }
  return known[type] ?? type.replace(/_/g, ' ')
}
