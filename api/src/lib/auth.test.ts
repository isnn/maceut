import { describe, it, expect, vi } from 'vitest'

vi.mock('./drizzle-client', () => ({ db: {}, pool: {} }))

import { auth } from './auth'

describe('auth rate-limit IP', () => {
  // Behind Cloudflare + the host proxy, X-Forwarded-For holds two addresses and Better
  // Auth resolves none from it: every visitor would share one rate-limit bucket.
  it('reads Cloudflare\'s single-address header before X-Forwarded-For', () => {
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(['cf-connecting-ip', 'x-forwarded-for'])
  })
})
