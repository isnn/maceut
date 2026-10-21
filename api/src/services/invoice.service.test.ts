import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/env', () => ({ config: { frontendUrl: 'https://maceut.hokya.dev', emailSupport: 'support.maceut@hokya.dev' } }))
vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../lib/pdf', () => ({ htmlToPdf: vi.fn(async () => Buffer.from('%PDF')) }))
vi.mock('../repositories/payment.repository', () => ({ findByOrderId: vi.fn() }))
vi.mock('../repositories/user.repository', () => ({ findByIdWithPlan: vi.fn() }))

import { invoiceFor, invoiceHtml, invoicePdf, methodLabel } from './invoice.service'
import * as paymentRepo from '../repositories/payment.repository'
import * as userRepo from '../repositories/user.repository'
import { htmlToPdf } from '../lib/pdf'

const USER = 'u1'
const PAID_AT = new Date('2026-10-18T06:14:57Z')
const END = new Date('2026-12-17T06:12:18Z')

function row(over: Record<string, unknown> = {}) {
  return {
    userId: USER,
    orderId: 'MCT-u1-1',
    plan: 'standard',
    amount: 349_000,
    status: 'paid',
    paymentType: 'qris',
    transactionId: 'trx-9',
    paidAt: PAID_AT,
    periodEnd: END,
    updatedAt: PAID_AT,
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ id: USER, name: 'Budi <Admin>', email: 'budi@example.com' } as never)
})

describe('invoiceFor', () => {
  it('builds the invoice from the recorded payment: order id, amount, method, period', async () => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(row())

    const { filename, data } = await invoiceFor(USER, 'MCT-u1-1')

    expect(filename).toBe('maceut-invoice-MCT-u1-1.pdf')
    expect(data).toMatchObject({ number: 'MCT-u1-1', amount: 349_000, plan: 'standard', method: 'qris', transactionId: 'trx-9', sellerSite: 'maceut.hokya.dev', supportEmail: 'support.maceut@hokya.dev' })
    // The period is the 30 days that end at period_end — for a renewal, after the old end.
    expect(data.periodStart).toEqual(new Date('2026-11-17T06:12:18Z'))
  })

  it("refuses another account's payment and an unpaid one", async () => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValueOnce(row({ userId: 'other' }))
    await expect(invoiceFor(USER, 'MCT-u1-1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValueOnce(row({ status: 'pending' }))
    await expect(invoiceFor(USER, 'MCT-u1-1')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValueOnce(undefined as never)
    await expect(invoiceFor(USER, 'MCT-x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(htmlToPdf).not.toHaveBeenCalled()
  })
})

describe('invoiceHtml', () => {
  it('shows the amount, WIB dates and status, and escapes what the customer typed', async () => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(row())
    const { data } = await invoiceFor(USER, 'MCT-u1-1')

    const html = invoiceHtml(data)

    expect(html).toContain('Rp 349,000')
    expect(html).toContain('Maceut Standard plan, 30 days')
    expect(html).toContain('17 Nov 2026 – 17 Dec 2026')
    expect(html).toContain('18 Oct 2026')
    expect(html).toContain('QRIS')
    expect(html).toContain('Paid')
    expect(html).toContain('Budi &lt;Admin&gt;')
    expect(html).not.toContain('<Admin>')
    expect(html).toContain('email support.maceut@hokya.dev and quote MCT-u1-1')
  })

  it('marks a refunded payment as refunded', async () => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(row({ status: 'refunded' }))
    const { data } = await invoiceFor(USER, 'MCT-u1-1')
    expect(invoiceHtml(data)).toContain('This payment was refunded.')
  })
})

describe('invoicePdf', () => {
  it('renders the HTML to a PDF', async () => {
    vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(row())
    const { pdf } = await invoicePdf(USER, 'MCT-u1-1')
    expect(pdf.toString()).toBe('%PDF')
    expect(vi.mocked(htmlToPdf).mock.calls[0]![0]).toContain('MCT-u1-1')
  })
})

describe('methodLabel', () => {
  it('names Midtrans methods as customers do', () => {
    expect(methodLabel('bank_transfer')).toBe('Bank transfer')
    expect(methodLabel('new_wallet')).toBe('new wallet')
    expect(methodLabel(null)).toBe('—')
  })
})
