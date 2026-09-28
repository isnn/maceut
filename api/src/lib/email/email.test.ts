import { describe, it, expect, vi } from 'vitest'
import { createResendProvider } from './resend.provider'
import { createMailtrapProvider } from './mailtrap.provider'
import { createConsoleProvider } from './console.provider'
import { createEmailProvider } from './index'
import { EmailSendError, parseAddress, type EmailMessage } from './types'

const message: EmailMessage = {
  to: 'rizky@example.com',
  subject: 'Your code',
  html: '<p>123456</p>',
  text: '123456',
  category: 'email-verification',
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

function sent(f: ReturnType<typeof fakeFetch>) {
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) }
}

describe('parseAddress', () => {
  it('splits a display name from the address', () => {
    expect(parseAddress('Maceut <no-reply@maceut.id>')).toEqual({ name: 'Maceut', email: 'no-reply@maceut.id' })
    expect(parseAddress('"Tim Maceut" <ops@maceut.id>')).toEqual({ name: 'Tim Maceut', email: 'ops@maceut.id' })
    expect(parseAddress('no-reply@maceut.id')).toEqual({ email: 'no-reply@maceut.id' })
  })
})

describe('resend provider', () => {
  it('posts the message to the Resend API with the bearer key', async () => {
    const f = fakeFetch(200, { id: 'em_1' })
    await createResendProvider({ apiKey: 're_key', from: 'Maceut <no-reply@maceut.id>', fetch: f }).send(message)

    const req = sent(f)
    expect(req.url).toBe('https://api.resend.com/emails')
    expect(req.headers.Authorization).toBe('Bearer re_key')
    expect(req.body).toMatchObject({
      from: 'Maceut <no-reply@maceut.id>',
      to: ['rizky@example.com'],
      subject: 'Your code',
      html: '<p>123456</p>',
      text: '123456',
      tags: [{ name: 'category', value: 'email-verification' }],
    })
  })

  it("throws EmailSendError with Resend's message when refused", async () => {
    const f = fakeFetch(403, { statusCode: 403, message: 'The maceut.id domain is not verified' })
    const send = createResendProvider({ apiKey: 'k', from: 'a@b.c', fetch: f }).send(message)
    await expect(send).rejects.toBeInstanceOf(EmailSendError)
    await expect(send).rejects.toThrow('[resend] The maceut.id domain is not verified')
  })

  it('throws EmailSendError when unreachable', async () => {
    const f = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    await expect(createResendProvider({ apiKey: 'k', from: 'a@b.c', fetch: f }).send(message)).rejects.toThrow(
      '[resend] unreachable: ECONNRESET',
    )
  })
})

describe('mailtrap provider', () => {
  it('sends for real when no inbox is set', async () => {
    const f = fakeFetch(200, { success: true, message_ids: ['m1'] })
    await createMailtrapProvider({ apiToken: 'tok', from: 'Maceut <no-reply@maceut.id>', fetch: f }).send(message)

    const req = sent(f)
    expect(req.url).toBe('https://send.api.mailtrap.io/api/send')
    expect(req.headers.Authorization).toBe('Bearer tok')
    expect(req.body).toEqual({
      from: { name: 'Maceut', email: 'no-reply@maceut.id' },
      to: [{ email: 'rizky@example.com' }],
      subject: 'Your code',
      html: '<p>123456</p>',
      text: '123456',
      category: 'email-verification',
    })
  })

  it('sends to the sandbox inbox when MAILTRAP_INBOX_ID is set', async () => {
    const f = fakeFetch(200, { success: true })
    await createMailtrapProvider({ apiToken: 'tok', from: 'a@b.c', inboxId: '4242', fetch: f }).send(message)
    expect(sent(f).url).toBe('https://sandbox.api.mailtrap.io/api/send/4242')
  })

  it("throws EmailSendError with Mailtrap's errors when refused", async () => {
    const f = fakeFetch(401, { success: false, errors: ['Unauthorized'] })
    await expect(createMailtrapProvider({ apiToken: 'bad', from: 'a@b.c', fetch: f }).send(message)).rejects.toThrow(
      '[mailtrap] Unauthorized',
    )
  })
})

describe('console provider', () => {
  it('logs the message instead of sending it', async () => {
    const log = vi.fn()
    await createConsoleProvider(log).send(message)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('to=rizky@example.com'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'))
  })
})

describe('createEmailProvider', () => {
  const c = { emailFrom: 'a@b.c', resendApiKey: 're', mailtrapApiToken: 'mt', mailtrapInboxId: undefined }
  it('builds the provider EMAIL_PROVIDER names', () => {
    expect(createEmailProvider({ ...c, emailProvider: 'resend' }).name).toBe('resend')
    expect(createEmailProvider({ ...c, emailProvider: 'mailtrap' }).name).toBe('mailtrap')
    expect(createEmailProvider({ ...c, emailProvider: 'console' }).name).toBe('console')
  })
})
