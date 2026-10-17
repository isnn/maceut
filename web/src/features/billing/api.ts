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
  prices: Record<Plan, number>
  periodDays: number
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
