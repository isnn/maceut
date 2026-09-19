import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock's factory is hoisted above every top-level const, so the state it closes
// over has to be hoisted with it.
const { cfg, state } = vi.hoisted(() => ({
  cfg: {
    r2AccountId: 'acct123' as string | undefined,
    r2AccessKeyId: 'key' as string | undefined,
    r2AccessKeySecret: 'secret' as string | undefined,
    r2BucketName: 'maceut-captures' as string | undefined,
    r2PublicUrl: 'https://cdn.maceut.id' as string | undefined,
    r2Endpoint: 'https://acct123.r2.cloudflarestorage.com' as string | undefined,
  },
  state: { configured: true, missing: [] as string[] },
}))

vi.mock('../config/env', () => ({
  config: cfg,
  isR2Configured: () => state.configured,
  missingIntegrationKeys: () => ({ r2: state.missing, here: [] }),
}))

import { capturePath, logoPath, publicUrlFor, getClient, resetClient } from './r2-client'
import { UpstreamError } from '../errors'

beforeEach(() => {
  state.configured = true
  state.missing = []
  resetClient()
})
afterEach(() => resetClient())

describe('capturePath (BR-011)', () => {
  it('builds captures/{user}/{YYYY}/{MM}/{id}.png', () => {
    expect(capturePath('u1', 'c1', new Date('2026-09-19T10:00:00Z'))).toBe('captures/u1/2026/09/c1.png')
  })

  it('zero-pads the month', () => {
    expect(capturePath('u1', 'c1', new Date('2026-01-05T10:00:00Z'))).toContain('/2026/01/')
    expect(capturePath('u1', 'c1', new Date('2026-12-05T10:00:00Z'))).toContain('/2026/12/')
  })

  it('uses UTC, so the key does not shift with the server timezone', () => {
    // 31 Dec 23:00 UTC is already 1 Jan in WIB. Using local time here would file the
    // same capture under two different months depending on where the worker runs.
    expect(capturePath('u1', 'c1', new Date('2026-12-31T23:00:00Z'))).toBe('captures/u1/2026/12/c1.png')
  })

  it('accepts a different extension for the JPG variant (BR-009)', () => {
    expect(capturePath('u1', 'c1', new Date('2026-09-19T10:00:00Z'), 'jpg')).toBe('captures/u1/2026/09/c1.jpg')
  })
})

describe('logoPath', () => {
  it('is per user and stable', () => {
    expect(logoPath('u1')).toBe('branding/u1/logo.png')
  })
})

describe('publicUrlFor', () => {
  it('joins without doubling the slash', () => {
    expect(publicUrlFor('captures/u1/2026/09/c1.png')).toBe('https://cdn.maceut.id/captures/u1/2026/09/c1.png')
  })

  it('tolerates a trailing slash on the configured URL', () => {
    cfg.r2PublicUrl = 'https://cdn.maceut.id/'
    expect(publicUrlFor('a.png')).toBe('https://cdn.maceut.id/a.png')
    cfg.r2PublicUrl = 'https://cdn.maceut.id'
  })

  it('returns undefined when no public URL is set, rather than guessing one', () => {
    // A guessed URL that 403s is worse than none: the caller can fall back to a
    // presigned URL only if it can tell there is nothing public to use.
    cfg.r2PublicUrl = undefined
    expect(publicUrlFor('a.png')).toBeUndefined()
    cfg.r2PublicUrl = 'https://cdn.maceut.id'
  })
})

describe('getClient', () => {
  it('names the missing keys instead of failing inside the SDK', () => {
    state.configured = false
    state.missing = ['R2_ACCESS_KEY_ID', 'R2_BUCKET_NAME']

    expect(() => getClient()).toThrow(UpstreamError)
    expect(() => getClient()).toThrow(/R2_ACCESS_KEY_ID, R2_BUCKET_NAME/)
    expect(() => getClient()).toThrow(/env:check/)
  })

  it('memoises the client', () => {
    expect(getClient()).toBe(getClient())
  })

  it('applies the settings R2 requires', async () => {
    const client = getClient()
    // The SDK stores some options as lazy providers rather than values.
    const resolve = async <T>(v: T | (() => Promise<T>)): Promise<T> =>
      typeof v === 'function' ? await (v as () => Promise<T>)() : v

    // Each of these fails in a way that does not name itself: virtual-host style
    // 404s as if the bucket were missing, SDK checksums make PUT fail alone while
    // every read works, and the wrong region refuses to sign at all.
    expect(client.config.forcePathStyle).toBe(true)
    expect(await resolve(client.config.requestChecksumCalculation)).toBe('WHEN_REQUIRED')
    expect(await resolve(client.config.region)).toBe('auto')
    expect(await resolve(client.config.endpoint as never)).toBeDefined()
  })
})
