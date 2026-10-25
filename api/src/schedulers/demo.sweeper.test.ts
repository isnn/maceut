import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/env', () => ({ config: { demoEnabled: true, demoEmail: 'demo@hokya.dev' } }))
vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/user.repository', () => ({ findByEmail: vi.fn() }))
vi.mock('../services/demo.service', () => ({
  resetDemoAccount: vi.fn(async () => ({ userId: 'd', replaced: true, filesRemoved: 0, seededCaptures: 0, sampleDay: null })),
}))

import * as userRepo from '../repositories/user.repository'
import { resetDemoAccount } from '../services/demo.service'
import { resetDue, tickOnce } from './demo.sweeper'

const demoCreatedAt = (iso: string) => vi.mocked(userRepo.findByEmail).mockResolvedValue({ createdAt: new Date(iso) } as never)

beforeEach(() => vi.clearAllMocks())

describe('demo sweeper', () => {
  it('is due when there is no demo account yet (first boot)', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(undefined)
    expect(await resetDue(new Date('2026-10-22T10:00:00+07:00'))).toBe(true)
  })

  it('is not due again on the same WIB day — a restart at noon keeps visitors signed in', async () => {
    demoCreatedAt('2026-10-22T00:00:30+07:00')
    expect(await resetDue(new Date('2026-10-22T23:59:00+07:00'))).toBe(false)
  })

  it('is due from 00:00 WIB the next day, not at UTC midnight', async () => {
    demoCreatedAt('2026-10-22T00:00:30+07:00')
    // 00:00 WIB on the 23rd is still 17:00 on the 22nd in UTC; the reset follows WIB.
    expect(await resetDue(new Date('2026-10-23T00:00:10+07:00'))).toBe(true)
    // 23:30 UTC on the 22nd = 06:30 WIB on the 23rd.
    expect(await resetDue(new Date('2026-10-22T23:30:00Z'))).toBe(true)
  })

  it('resets once when due, and never runs two at once', async () => {
    demoCreatedAt('2026-10-21T00:00:30+07:00')
    let release!: () => void
    vi.mocked(resetDemoAccount).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ userId: 'd', replaced: true, filesRemoved: 0, seededCaptures: 0, sampleDay: null }))),
    )
    const now = new Date('2026-10-22T00:01:00+07:00')
    const first = tickOnce(now)
    await vi.waitFor(() => expect(resetDemoAccount).toHaveBeenCalledTimes(1))
    expect(await tickOnce(now)).toBe(false)
    release()
    expect(await first).toBe(true)
    expect(resetDemoAccount).toHaveBeenCalledTimes(1)
  })
})
