/**
 * Invoices for plan payments (FE-56): a PDF per paid payment, from the Billing tab.
 *
 * Built only from what this server recorded and Midtrans confirmed — the payments row
 * (amount, method, transaction id, paid time, period) and the account. The invoice
 * number is the order id, so staff, the customer and the Midtrans dashboard all quote
 * the same reference. No tax lines: none are charged or registered for yet.
 */
import { config } from '../config/env'
import { NotFoundError, ValidationError } from '../errors'
import { htmlToPdf } from '../lib/pdf'
import * as paymentRepo from '../repositories/payment.repository'
import * as userRepo from '../repositories/user.repository'
import { PAID_PERIOD_DAYS, type Plan } from '../types/plan'

const DAY_MS = 86_400_000
const PLAN_NAME: Record<Plan, string> = { free: 'Free', starter: 'Starter', standard: 'Standard', premium: 'Premium' }

/** Midtrans' payment_type as a customer would name it (mirrors web billing/api.ts). */
const METHOD: Record<string, string> = {
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

export interface InvoiceData {
  number: string
  status: 'paid' | 'refunded'
  issuedAt: Date
  customerName: string
  customerEmail: string
  plan: Plan
  amount: number
  periodStart: Date | null
  periodEnd: Date | null
  method: string | null
  transactionId: string | null
  sellerSite: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function wibDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(d)
}

export function rupiah(n: number): string {
  return `Rp ${new Intl.NumberFormat('en-US').format(n)}`
}

export function methodLabel(type: string | null): string {
  if (!type) return '—'
  return METHOD[type] ?? type.replace(/_/g, ' ')
}

export function invoiceHtml(d: InvoiceData): string {
  const period = d.periodStart && d.periodEnd ? `${wibDate(d.periodStart)} – ${wibDate(d.periodEnd)}` : `${PAID_PERIOD_DAYS} days`
  const stamp = d.status === 'refunded' ? 'Refunded' : 'Paid'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(d.number)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #1f2430; font-size: 10.5pt; line-height: 1.5; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { font-size: 20pt; font-weight: 700; letter-spacing: -0.02em; color: #5a35f3; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 16pt; letter-spacing: 0.08em; text-transform: uppercase; }
  .stamp { display: inline-block; margin-top: 6px; padding: 2px 10px; border: 1.5px solid ${d.status === 'refunded' ? '#8a5a00' : '#17803d'}; color: ${d.status === 'refunded' ? '#8a5a00' : '#17803d'}; border-radius: 4px; font-weight: 700; font-size: 9pt; letter-spacing: 0.1em; text-transform: uppercase; }
  .muted { color: #626a7a; }
  .meta { margin-top: 28px; display: grid; grid-template-columns: 1fr auto; gap: 32px; }
  .label { font-size: 8pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #626a7a; margin-bottom: 4px; }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; }
  dt { color: #626a7a; } dd { margin: 0; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 32px; }
  th { text-align: left; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #626a7a; border-bottom: 1.5px solid #1f2430; padding: 6px 0; }
  td { padding: 10px 0; border-bottom: 1px solid #e3e5ea; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total td { border-bottom: none; font-weight: 700; font-size: 12pt; padding-top: 14px; }
  footer { margin-top: 48px; font-size: 9pt; color: #626a7a; }
</style></head>
<body>
  <div class="top">
    <div>
      <div class="brand">Maceut</div>
      <div class="muted">${esc(d.sellerSite)}</div>
    </div>
    <div class="doc">
      <h1>Invoice</h1>
      <div class="stamp">${stamp}</div>
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="label">Billed to</div>
      ${d.customerName ? `<div><strong>${esc(d.customerName)}</strong></div>` : ''}
      <div>${esc(d.customerEmail)}</div>
    </div>
    <div>
      <dl>
        <dt>Invoice no.</dt><dd>${esc(d.number)}</dd>
        <dt>Date paid</dt><dd>${wibDate(d.issuedAt)}</dd>
        <dt>Payment method</dt><dd>${esc(methodLabel(d.method))}</dd>
        ${d.transactionId ? `<dt>Transaction ID</dt><dd>${esc(d.transactionId)}</dd>` : ''}
      </dl>
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
    <tbody>
      <tr>
        <td>Maceut ${PLAN_NAME[d.plan]} plan, ${PAID_PERIOD_DAYS} days<div class="muted">${period}</div></td>
        <td class="num">1</td>
        <td class="num">${rupiah(d.amount)}</td>
      </tr>
      <tr class="total"><td>Total (IDR)</td><td></td><td class="num">${rupiah(d.amount)}</td></tr>
    </tbody>
  </table>

  <footer>
    ${d.status === 'refunded' ? 'This payment was refunded. ' : 'Paid in full. '}Dates are in WIB (UTC+7).
    For questions about this invoice, contact us at ${esc(d.sellerSite)} and quote ${esc(d.number)}.
  </footer>
</body></html>`
}

/** What the controller sends: an invoice for one of the account's own paid payments. */
export async function invoiceFor(userId: string, orderId: string): Promise<{ filename: string; data: InvoiceData }> {
  const payment = await paymentRepo.findByOrderId(orderId)
  if (!payment || payment.userId !== userId) throw new NotFoundError('Payment')
  if (payment.status !== 'paid' && payment.status !== 'refunded') {
    throw new ValidationError('An invoice is available once the payment is confirmed.')
  }
  const account = await userRepo.findByIdWithPlan(userId)
  if (!account) throw new NotFoundError('User')

  const data: InvoiceData = {
    number: payment.orderId,
    status: payment.status,
    issuedAt: payment.paidAt ?? payment.updatedAt,
    customerName: account.name ?? '',
    customerEmail: account.email,
    plan: payment.plan,
    amount: payment.amount,
    periodStart: payment.periodEnd ? new Date(payment.periodEnd.getTime() - PAID_PERIOD_DAYS * DAY_MS) : null,
    periodEnd: payment.periodEnd,
    method: payment.paymentType,
    transactionId: payment.transactionId,
    sellerSite: new URL(config.frontendUrl).host,
  }
  return { filename: `maceut-invoice-${payment.orderId}.pdf`, data }
}

export async function invoicePdf(userId: string, orderId: string): Promise<{ filename: string; pdf: Buffer }> {
  const { filename, data } = await invoiceFor(userId, orderId)
  return { filename, pdf: await htmlToPdf(invoiceHtml(data)) }
}
