import { describe, it, expect, vi } from 'vitest'
import { createResendProvider } from './resend.provider'
import { createMailtrapProvider } from './mailtrap.provider'
import { createConsoleProvider } from './console.provider'
import { createFallbackProvider } from './fallback.provider'
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

describe('inline images', () => {
  const withLogo: EmailMessage = {
    ...message,
    inline: [{ contentId: 'maceut-logo', filename: 'maceut-logo.png', contentType: 'image/png', content: 'iVBO' }],
  }

  it('mailtrap sends them as inline attachments', async () => {
    const f = fakeFetch(200, { success: true })
    await createMailtrapProvider({ apiToken: 'tok', from: 'a@b.c', fetch: f }).send(withLogo)
    expect(sent(f).body.attachments).toEqual([
      { content: 'iVBO', filename: 'maceut-logo.png', type: 'image/png', disposition: 'inline', content_id: 'maceut-logo' },
    ])
  })

  it('resend sends them with a content id', async () => {
    const f = fakeFetch(200, { id: 'x' })
    await createResendProvider({ apiKey: 're', from: 'a@b.c', fetch: f }).send(withLogo)
    expect(sent(f).body.attachments).toEqual([
      { content: 'iVBO', filename: 'maceut-logo.png', content_type: 'image/png', content_id: 'maceut-logo' },
    ])
  })
})

describe('createEmailProvider', () => {
  const c = { emailFrom: 'a@b.c', resendApiKey: 're', mailtrapApiToken: 'mt', mailtrapInboxId: undefined }
  it('builds the single provider config names', () => {
    expect(createEmailProvider({ ...c, emailProviders: ['resend'] }).name).toBe('resend')
    expect(createEmailProvider({ ...c, emailProviders: ['mailtrap'] }).name).toBe('mailtrap')
    expect(createEmailProvider({ ...c, emailProviders: ['console'] }).name).toBe('console')
  })

  it('chains Mailtrap then Resend, named after the first', () => {
    expect(createEmailProvider({ ...c, emailProviders: ['mailtrap', 'resend'] }).name).toBe('mailtrap')
  })
})

describe('fallback provider', () => {
  const ok = (name: 'mailtrap' | 'resend') => ({ name, send: vi.fn().mockResolvedValue(undefined) })
  const failing = (name: 'mailtrap' | 'resend', reason: string) => ({
    name,
    send: vi.fn().mockRejectedValue(new EmailSendError(name, reason, 429)),
  })

  it('uses only the first provider when it accepts', async () => {
    const [a, b] = [ok('mailtrap'), ok('resend')]
    expect(await createFallbackProvider([a, b], vi.fn()).send(message)).toBe('mailtrap')
    expect(b.send).not.toHaveBeenCalled()
  })

  it('moves to Resend when Mailtrap fails, and says so', async () => {
    const warn = vi.fn()
    const [a, b] = [failing('mailtrap', 'quota exceeded'), ok('resend')]
    expect(await createFallbackProvider([a, b], warn).send(message)).toBe('resend')
    expect(b.send).toHaveBeenCalledWith(message)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mailtrap failed ([mailtrap] quota exceeded), trying resend'))
  })

  it('throws with every reason when all fail', async () => {
    const p = createFallbackProvider([failing('mailtrap', 'quota exceeded'), failing('resend', 'bad key')], vi.fn())
    await expect(p.send(message)).rejects.toThrow(/all providers failed: \[mailtrap\] quota exceeded \| \[resend\] bad key/)
  })
})
