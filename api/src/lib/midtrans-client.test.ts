import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const cfg = vi.hoisted(() => ({
  midtransServerKey: 'SB-Mid-server-TESTKEY' as string | undefined,
  midtransIsProduction: false,
}))
vi.mock('../config/env', () => ({
  config: cfg,
  isMidtransConfigured: () => Boolean(cfg.midtransServerKey),
}))

import { amountMatches, cancelTransaction, createSnapTransaction, getStatus, hosts, outcomeOf, subscriptionTime, verifySignature } from './midtrans-client'
import { PaymentProviderError, PaymentsNotConfiguredError } from '../errors'

const fetchMock = vi.fn()

beforeEach(() => {
  cfg.midtransServerKey = 'SB-Mid-server-TESTKEY'
  cfg.midtransIsProduction = false
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

// SHA512("MCT-ab12cd34-1792200000" + "200" + "99000.00" + "SB-Mid-server-TESTKEY"),
// computed once outside this code, so a change to the formula fails here.
const FIXTURE = {
  order_id: 'MCT-ab12cd34-1792200000',
  status_code: '200',
  gross_amount: '99000.00',
  signature_key:
    'ee055d5df78c1f4f5a3e7aef1cb0ba416e52bc95014ccbb7cbfa803716fdaf4a1d18bf4ebc6645627dad2be86c42813e8c888997be0b647358b306334bd6027f',
}

describe('verifySignature (T1, T2)', () => {
  it('accepts a notification signed with the server key', () => {
    expect(verifySignature(FIXTURE)).toBe(true)
  })

  it('accepts the signature in upper case too', () => {
    expect(verifySignature({ ...FIXTURE, signature_key: FIXTURE.signature_key.toUpperCase() })).toBe(true)
  })

  it('refuses a reformatted amount — the raw string is what is signed', () => {
    expect(verifySignature({ ...FIXTURE, gross_amount: '99000' })).toBe(false)
  })

  it('refuses any changed field, a wrong key, or a missing signature', () => {
    expect(verifySignature({ ...FIXTURE, order_id: 'MCT-ab12cd34-1792200001' })).toBe(false)
    expect(verifySignature({ ...FIXTURE, status_code: '201' })).toBe(false)
    expect(verifySignature(FIXTURE, 'SB-Mid-server-OTHER')).toBe(false)
    expect(verifySignature({ ...FIXTURE, signature_key: undefined })).toBe(false)
    expect(verifySignature({ ...FIXTURE, signature_key: 'abc' })).toBe(false)
  })
})

describe('outcomeOf (T3)', () => {
  it.each([
    ['settlement', undefined, 'paid'],
    ['capture', 'accept', 'paid'],
    ['capture', 'challenge', null],
    ['capture', undefined, null],
    ['pending', undefined, null],
    ['deny', undefined, 'failed'],
    ['failure', undefined, 'failed'],
    ['cancel', undefined, 'cancelled'],
    ['expire', undefined, 'expired'],
    ['refund', undefined, 'refunded'],
    ['partial_refund', undefined, 'refunded'],
    ['something_new', undefined, null],
  ])('%s / %s → %s', (status, fraud, expected) => {
    expect(outcomeOf(status, fraud)).toBe(expected)
  })
})

describe('amountMatches', () => {
  it('compares Midtrans "99000.00" with integer rupiah', () => {
    expect(amountMatches('99000.00', 99_000)).toBe(true)
    expect(amountMatches('99000', 99_000)).toBe(true)
    expect(amountMatches('9900.00', 99_000)).toBe(false)
    expect(amountMatches('abc', 99_000)).toBe(false)
  })
})

describe('subscriptionTime', () => {
  it('writes the Subscription API format in WIB', () => {
    expect(subscriptionTime(new Date('2026-11-20T03:04:05Z'))).toBe('2026-11-20 10:04:05 +0700')
    expect(subscriptionTime(new Date('2026-12-31T18:00:00Z'))).toBe('2027-01-01 01:00:00 +0700')
  })
})

describe('hosts', () => {
  it('keeps Snap (app.*) and Core (api.*) apart, sandbox unless production', () => {
    expect(hosts(false)).toEqual({ snap: 'https://app.sandbox.midtrans.com', core: 'https://api.sandbox.midtrans.com' })
    expect(hosts(true)).toEqual({ snap: 'https://app.midtrans.com', core: 'https://api.midtrans.com' })
  })
})

describe('createSnapTransaction', () => {
  const body = {
    transaction_details: { order_id: 'MCT-1', gross_amount: 99_000 },
    item_details: [{ id: 'starter', price: 99_000, quantity: 1, name: 'Maceut Starter, 30 days' }],
  }

  it('posts to the sandbox Snap host with Basic auth (server key, empty password)', async () => {
    fetchMock.mockResolvedValue(json(201, { token: 'tok', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/x' }))

    const res = await createSnapTransaction(body)

    expect(res.token).toBe('tok')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('SB-Mid-server-TESTKEY:').toString('base64')}`)
    expect(JSON.parse(init.body)).toEqual(body)
  })

  it('turns a refusal into PAYMENT_PROVIDER_ERROR', async () => {
    fetchMock.mockResolvedValue(json(401, { error_messages: ['Access denied'] }))
    await expect(createSnapTransaction(body)).rejects.toBeInstanceOf(PaymentProviderError)
  })

  it('turns a network failure into PAYMENT_PROVIDER_ERROR', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    await expect(createSnapTransaction(body)).rejects.toBeInstanceOf(PaymentProviderError)
  })

  it('refuses to call Midtrans without a server key (T9)', async () => {
    cfg.midtransServerKey = undefined
    await expect(createSnapTransaction(body)).rejects.toBeInstanceOf(PaymentsNotConfiguredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getStatus', () => {
  it('reads the Core status of an order', async () => {
    fetchMock.mockResolvedValue(
      json(200, { order_id: 'MCT-1', status_code: '200', gross_amount: '99000.00', transaction_status: 'settlement' }),
    )

    const s = await getStatus('MCT-1')

    expect(s?.transaction_status).toBe('settlement')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.sandbox.midtrans.com/v2/MCT-1/status')
  })

  it('returns null when no transaction exists yet, in either form Midtrans uses', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { status_code: '404' }))
    expect(await getStatus('MCT-1')).toBeNull()
    fetchMock.mockResolvedValueOnce(json(200, { status_code: '404', status_message: "Transaction doesn't exist." }))
    expect(await getStatus('MCT-1')).toBeNull()
  })

  it('throws when the key is refused', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {}))
    await expect(getStatus('MCT-1')).rejects.toBeInstanceOf(PaymentProviderError)
    fetchMock.mockResolvedValueOnce(json(200, { status_code: '401' }))
    await expect(getStatus('MCT-1')).rejects.toBeInstanceOf(PaymentProviderError)
  })
})

describe('cancelTransaction', () => {
  it('posts to the Core cancel endpoint', async () => {
    fetchMock.mockResolvedValue(json(200, { status_code: '200', transaction_status: 'cancel' }))
    expect(await cancelTransaction('MCT-1')).toBe('cancelled')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.sandbox.midtrans.com/v2/MCT-1/cancel')
    expect(init.method).toBe('POST')
  })

  it('reads the answer from the body status_code, as Core API reports it', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status_code: '412' }))
    expect(await cancelTransaction('MCT-1')).toBe('not_cancellable')
    fetchMock.mockResolvedValueOnce(json(404, { status_code: '404' }))
    expect(await cancelTransaction('MCT-1')).toBe('no_transaction')
  })

  it('throws on anything else', async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}))
    await expect(cancelTransaction('MCT-1')).rejects.toBeInstanceOf(PaymentProviderError)
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    await expect(cancelTransaction('MCT-1')).rejects.toBeInstanceOf(PaymentProviderError)
  })
})
