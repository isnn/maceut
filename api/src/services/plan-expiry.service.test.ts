import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/user.repository', () => ({ findByIdWithPlan: vi.fn(), expireToFree: vi.fn() }))
vi.mock('../repositories/plan-change.repository', () => ({ record: vi.fn() }))
vi.mock('./plan.service', () => ({
  applyPlanChange: vi.fn(async () => ({ zonesToPause: [{ id: 'z1', name: 'Malioboro' }], schedulesToPause: [] })),
}))
vi.mock('./notification.service', () => ({ onPlanExpired: vi.fn() }))
vi.mock('./auto-renew.service', () => ({ RETRY_DAYS: 3, stopQuietly: vi.fn() }))

import { findSettled, settle } from './plan-expiry.service'
import * as userRepo from '../repositories/user.repository'
import * as planChangeRepo from '../repositories/plan-change.repository'
import * as planService from './plan.service'
import * as notificationService from './notification.service'
import * as autoRenew from './auto-renew.service'

const NOW = new Date('2026-11-16T05:00:00Z')
const PAST = new Date(NOW.getTime() - 60_000)
const FUTURE = new Date(NOW.getTime() + 86_400_000)

function account(plan: string, planExpiresAt: Date | null) {
  return { id: 'u1', email: 'budi@example.com', plan, planExpiresAt } as never as userRepo.UserWithPlan
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('settle', () => {
  it('T22: an ended paid period moves to Free once, pausing what no longer fits', async () => {
    vi.mocked(userRepo.expireToFree).mockResolvedValue({ plan: 'free' } as never)

    const out = await settle(account('starter', PAST), NOW)

    expect(out.plan).toBe('free')
    expect(out.planExpiresAt).toBeNull()
    expect(userRepo.expireToFree).toHaveBeenCalledWith('u1', PAST)
    expect(planService.applyPlanChange).toHaveBeenCalledWith('u1', 'free')
    expect(planChangeRepo.record).toHaveBeenCalledWith({ userId: 'u1', fromPlan: 'starter', toPlan: 'free', source: 'expiry' })
    expect(notificationService.onPlanExpired).toHaveBeenCalledWith('u1', { from: 'starter', expiresAt: PAST, paused: ['Malioboro'] })
  })

  it('T22: when another request already moved it, nothing runs twice and the current row is returned', async () => {
    vi.mocked(userRepo.expireToFree).mockResolvedValue(undefined)
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('free', null))

    const out = await settle(account('starter', PAST), NOW)

    expect(out.plan).toBe('free')
    expect(planService.applyPlanChange).not.toHaveBeenCalled()
    expect(notificationService.onPlanExpired).not.toHaveBeenCalled()
  })

  it('a renewal that landed in between is not undone', async () => {
    vi.mocked(userRepo.expireToFree).mockResolvedValue(undefined) // end date changed under it
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('starter', FUTURE))

    expect((await settle(account('starter', PAST), NOW)).plan).toBe('starter')
  })

  it('T23: a period not yet ended, a plan without an end date, and Free are untouched', async () => {
    for (const a of [account('starter', FUTURE), account('standard', null), account('free', null)]) {
      expect(await settle(a, NOW)).toBe(a)
    }
    expect(userRepo.expireToFree).not.toHaveBeenCalled()
  })
})

describe('settle with auto-renew on', () => {
  it('waits out Midtrans’ 3 retry days before moving to Free, then cancels the subscription', async () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 86_400_000)
    const on = (end: Date) => ({ ...account('starter', end), autoRenew: true }) as never as userRepo.UserWithPlan

    expect((await settle(on(twoDaysAgo), NOW)).plan).toBe('starter')
    expect(userRepo.expireToFree).not.toHaveBeenCalled()

    vi.mocked(userRepo.expireToFree).mockResolvedValue({ plan: 'free' } as never)
    const fourDaysAgo = new Date(NOW.getTime() - 4 * 86_400_000)
    expect((await settle(on(fourDaysAgo), NOW)).plan).toBe('free')
    expect(autoRenew.stopQuietly).toHaveBeenCalledWith('u1')
  })
})

describe('findSettled', () => {
  it('loads and settles in one call', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(account('premium', PAST))
    vi.mocked(userRepo.expireToFree).mockResolvedValue({ plan: 'free' } as never)
    expect((await findSettled('u1', NOW))?.plan).toBe('free')
  })

  it('returns undefined for an account that does not exist', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(undefined)
    expect(await findSettled('u1', NOW)).toBeUndefined()
  })
})
