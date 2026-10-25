import { describe, it, expect, vi, beforeEach } from 'vitest'

const config = vi.hoisted(() => ({ demoEnabled: true, demoEmail: 'demo@hokya.dev' }))
vi.mock('../config/env', () => ({ config }))

import { demoLocked, isDemoUser } from './demo'

beforeEach(() => {
  config.demoEnabled = true
})

describe('isDemoUser', () => {
  it('matches the demo address, ignoring case and spaces', () => {
    expect(isDemoUser('demo@hokya.dev')).toBe(true)
    expect(isDemoUser(' Demo@Hokya.dev ')).toBe(true)
    expect(isDemoUser('someone@hokya.dev')).toBe(false)
    expect(isDemoUser(undefined)).toBe(false)
  })

  it('is never true while DEMO_ENABLED is off', () => {
    config.demoEnabled = false
    expect(isDemoUser('demo@hokya.dev')).toBe(false)
  })
})

describe('demoLocked (Better Auth hook)', () => {
  const session = (email?: string) => vi.fn(async () => email)

  it('refuses a password change from a demo session', async () => {
    expect(await demoLocked('/change-password', {}, session('demo@hokya.dev'))).toBe(true)
    expect(await demoLocked('/revoke-other-sessions', {}, session('demo@hokya.dev'))).toBe(true)
  })

  it("keeps the other visitors' sessions out of reach", async () => {
    expect(await demoLocked('/list-sessions', {}, session('demo@hokya.dev'))).toBe(true)
    expect(await demoLocked('/revoke-session', { token: 't' }, session('demo@hokya.dev'))).toBe(true)
    expect(await demoLocked('/list-sessions', {}, session('someone@hokya.dev'))).toBe(false)
  })

  it('lets any other account change its password', async () => {
    expect(await demoLocked('/change-password', {}, session('someone@hokya.dev'))).toBe(false)
  })

  it('refuses a password reset or a code for the demo address, by the body', async () => {
    const lookup = session()
    expect(await demoLocked('/email-otp/request-password-reset', { email: 'demo@hokya.dev' }, lookup)).toBe(true)
    expect(await demoLocked('/email-otp/send-verification-otp', { email: 'demo@hokya.dev', type: 'sign-in' }, lookup)).toBe(true)
    expect(await demoLocked('/sign-up/email', { email: 'demo@hokya.dev' }, lookup)).toBe(true)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('leaves sign-in and other paths alone, without looking up the session', async () => {
    const lookup = session('demo@hokya.dev')
    expect(await demoLocked('/sign-in/email', { email: 'demo@hokya.dev' }, lookup)).toBe(false)
    expect(await demoLocked('/update-user', { name: 'x' }, lookup)).toBe(false)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('refuses nothing while DEMO_ENABLED is off', async () => {
    config.demoEnabled = false
    expect(await demoLocked('/change-password', {}, session('demo@hokya.dev'))).toBe(false)
  })
})
