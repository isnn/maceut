import { describe, it, expect, vi, beforeEach } from 'vitest'

const send = vi.fn()
vi.mock('../lib/email', () => ({ getEmailProvider: () => ({ name: 'console', send }) }))

import { otpEmail, sendOtpEmail } from './email.service'

beforeEach(() => send.mockReset())

describe('otpEmail', () => {
  it('puts the code, its expiry and the purpose in both bodies', () => {
    const m = otpEmail('rizky@example.com', '482913', 'email-verification')
    expect(m.to).toBe('rizky@example.com')
    expect(m.subject).toBe('Your Maceut verification code')
    expect(m.category).toBe('email-verification')
    for (const body of [m.html, m.text]) {
      expect(body).toContain('482913')
      expect(body).toContain('expires in 10 minutes')
    }
  })

  it('words a password reset as a reset', () => {
    const m = otpEmail('rizky@example.com', '111111', 'forget-password')
    expect(m.subject).toBe('Your Maceut password reset code')
    expect(m.text).toContain("your password hasn't changed")
  })
})

describe('sendOtpEmail', () => {
  it('hands the message to the configured provider', async () => {
    await sendOtpEmail('rizky@example.com', '482913', 'forget-password')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'rizky@example.com', category: 'forget-password' }))
  })

  it('logs rather than throws when the provider fails', async () => {
    send.mockRejectedValueOnce(new Error('[resend] domain not verified'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(sendOtpEmail('rizky@example.com', '1', 'email-verification')).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('not sent'), '[resend] domain not verified')
    error.mockRestore()
  })
})
