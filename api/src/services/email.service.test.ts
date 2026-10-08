import { describe, it, expect, vi, beforeEach } from 'vitest'

const send = vi.fn()
vi.mock('../lib/email', () => ({ getEmailProvider: () => ({ name: 'console', send }) }))
vi.mock('../repositories/notification.repository', () => ({ countSent: vi.fn(async () => 0), logEmail: vi.fn(async () => undefined) }))

import { captureProblemsEmail, otpEmail, sendOtpEmail } from './email.service'
import * as notificationRepo from '../repositories/notification.repository'

beforeEach(() => {
  send.mockReset()
  vi.mocked(notificationRepo.countSent).mockReset().mockResolvedValue(0)
  vi.mocked(notificationRepo.logEmail).mockClear()
})

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
    expect(notificationRepo.logEmail).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    error.mockRestore()
  })
})

describe('OTP send limits', () => {
  const now = new Date('2026-09-28T03:00:00Z')

  it('logs every code it sends — the cost meter', async () => {
    await sendOtpEmail('rizky@example.com', '123456', 'email-verification', now)
    expect(send).toHaveBeenCalledTimes(1)
    expect(notificationRepo.logEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'rizky@example.com', category: 'email-verification', status: 'sent' }),
    )
  })

  it('stops at 3 codes per address per 10 minutes, without telling the requester', async () => {
    vi.mocked(notificationRepo.countSent).mockResolvedValueOnce(3)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(sendOtpEmail('rizky@example.com', '123456', 'email-verification', now)).resolves.toBeUndefined()
    expect(send).not.toHaveBeenCalled()
    expect(notificationRepo.logEmail).toHaveBeenCalledWith(expect.objectContaining({ status: 'suppressed' }))
    expect(vi.mocked(notificationRepo.countSent).mock.calls[0]![2]).toEqual(new Date(now.getTime() - 10 * 60 * 1000))
    warn.mockRestore()
  })

  it('stops at 10 codes per address per day', async () => {
    vi.mocked(notificationRepo.countSent).mockResolvedValueOnce(2).mockResolvedValueOnce(10)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await sendOtpEmail('rizky@example.com', '123456', 'forget-password', now)
    expect(send).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('captureProblemsEmail', () => {
  it('lists every failing zone with its WIB start time, and says how to switch it off', () => {
    const m = captureProblemsEmail('rizky@example.com', [
      { zoneId: 'z1', zoneName: 'Sudirman', since: new Date('2026-09-28T00:00:00Z'), error: null },
      { zoneId: 'z2', zoneName: 'Malioboro', since: new Date('2026-09-28T01:00:00Z'), error: null },
    ])
    expect(m.subject).toBe('2 zones have stopped collecting traffic')
    expect(m.text).toContain('Sudirman — failing since 28 Sept, 07:00 WIB')
    expect(m.text).toContain('Profile → Notifications')
    expect(m.category).toBe('capture-problems')
  })
})
