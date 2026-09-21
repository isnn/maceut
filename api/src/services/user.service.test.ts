import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/user.repository', () => ({
  findById: vi.fn(),
  findByIdWithPlan: vi.fn(),
  setPlan: vi.fn(),
  updateUser: vi.fn(),
  listWithPlans: vi.fn(),
  countInternal: vi.fn(async () => 0),
}))
vi.mock('../repositories/zone.repository', () => ({
  findByUserId: vi.fn(async () => []),
  update: vi.fn(),
  countsByUser: vi.fn(async () => new Map()),
  countAllCollecting: vi.fn(async () => 0),
}))
vi.mock('../repositories/schedule.repository', () => ({
  findByUserId: vi.fn(async () => []),
  update: vi.fn(),
  countsByUser: vi.fn(async () => new Map()),
  countAllActive: vi.fn(async () => 0),
}))
vi.mock('../lib/internal-access', () => ({
  isInternalByConfig: vi.fn(() => false),
  resolveRole: vi.fn((_email: string, stored: string) => stored),
  configuredInternalEmails: vi.fn(() => []),
}))

import * as userRepo from '../repositories/user.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import { changeOwnPlan, changePlan, completeOnboarding, listUsers, getPlatformStats } from './user.service'
import { UpgradeNotSelfServeError } from '../errors'
import type { Plan } from '../types/plan'

const USER = 'user_01'

function row(over: Record<string, unknown> = {}) {
  return {
    id: USER,
    email: 'budi@example.com',
    name: 'Budi',
    plan: 'free' as Plan,
    role: 'user',
    onboardingDone: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(userRepo.findById).mockResolvedValue(row())
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row())
  vi.mocked(userRepo.listWithPlans).mockResolvedValue({ rows: [row()], total: 1 } as never)
  vi.mocked(zoneRepo.countsByUser).mockResolvedValue(new Map())
  vi.mocked(scheduleRepo.countsByUser).mockResolvedValue(new Map())
})

describe('completeOnboarding', () => {
  it('marks onboarding done without touching the plan', async () => {
    // The step used to take a plan, which is how a brand-new account could award itself
    // Premium limits before paying anything. Registration already created the free row.
    await completeOnboarding(USER)

    expect(userRepo.updateUser).toHaveBeenCalledWith(USER, { onboardingDone: true })
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })
})

describe('changeOwnPlan — self-serve upgrades are closed until billing', () => {
  it('refuses free → standard', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ plan: 'free' }))

    await expect(changeOwnPlan(USER, 'standard')).rejects.toBeInstanceOf(UpgradeNotSelfServeError)
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })

  it('refuses standard → premium', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ plan: 'standard' }))

    await expect(changeOwnPlan(USER, 'premium')).rejects.toBeInstanceOf(UpgradeNotSelfServeError)
  })

  it('answers 403, not 402 — there is nothing to pay with yet', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ plan: 'free' }))

    await expect(changeOwnPlan(USER, 'premium')).rejects.toMatchObject({
      statusCode: 403,
      code: 'UPGRADE_NOT_SELF_SERVE',
    })
  })

  it('allows a downgrade — giving up capacity costs the business nothing', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ plan: 'premium' }))

    await changeOwnPlan(USER, 'free')

    expect(userRepo.setPlan).toHaveBeenCalledWith(USER, 'free')
  })

  it('allows staying on the same plan', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ plan: 'standard' }))

    await changeOwnPlan(USER, 'standard')

    expect(userRepo.setPlan).toHaveBeenCalledWith(USER, 'standard')
  })

  it('still lets staff grant a paid plan', async () => {
    // The gate is on the self-serve path only. /internal/users is how an upgrade
    // happens, and it leaves a record of who granted it.
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ plan: 'free' }))

    await changePlan(USER, 'premium')

    expect(userRepo.setPlan).toHaveBeenCalledWith(USER, 'premium')
  })
})

describe('listUsers — usage is measured, not guessed', () => {
  it('reports the account’s real zone and window counts', async () => {
    vi.mocked(zoneRepo.countsByUser).mockResolvedValue(new Map([[USER, { collecting: 3, paused: 2 }]]))
    vi.mocked(scheduleRepo.countsByUser).mockResolvedValue(new Map([[USER, { active: 4, paused: 1 }]]))

    const { users } = await listUsers({ page: 1, limit: 25 })

    expect(users[0]!.usage).toMatchObject({
      zonesCount: 3,
      zonesPaused: 2,
      schedulesActiveCount: 4,
      schedulesPaused: 1,
    })
  })

  it('reads an account with no rows as zero, not as unknown', async () => {
    const { users } = await listUsers({ page: 1, limit: 25 })

    expect(users[0]!.usage.zonesCount).toBe(0)
    expect(users[0]!.usage.schedulesActiveCount).toBe(0)
  })

  it('leaves captures and storage null — nothing counts them yet', async () => {
    const { users } = await listUsers({ page: 1, limit: 25 })

    // Zero would assert the account captured nothing, which is a different claim.
    expect(users[0]!.usage.capturesToday).toBeNull()
    expect(users[0]!.usage.storageUsedGb).toBeNull()
  })

  it('counts in one grouped query, not one per listed account', async () => {
    vi.mocked(userRepo.listWithPlans).mockResolvedValue({
      rows: [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })],
      total: 3,
    } as never)

    await listUsers({ page: 1, limit: 25 })

    // Per-row counting would make the directory slower with every signup.
    expect(zoneRepo.countsByUser).toHaveBeenCalledTimes(1)
    expect(scheduleRepo.countsByUser).toHaveBeenCalledTimes(1)
  })
})

describe('getPlatformStats', () => {
  it('measures zones and windows platform-wide', async () => {
    vi.mocked(zoneRepo.countAllCollecting).mockResolvedValue(12)
    vi.mocked(scheduleRepo.countAllActive).mockResolvedValue(7)

    const stats = await getPlatformStats()

    expect(stats.zonesCollecting).toBe(12)
    expect(stats.schedulesActive).toBe(7)
  })

  it('still reports captures and storage as unmeasured', async () => {
    const stats = await getPlatformStats()

    expect(stats.capturesToday).toBeNull()
    expect(stats.storageUsedGb).toBeNull()
  })

  it('excludes internal accounts from the customer count', async () => {
    await getPlatformStats()

    // Staff are not customers: counting them inflates the total and, because the
    // frontend multiplies the plan mix by a price, invents revenue.
    expect(userRepo.listWithPlans).toHaveBeenCalledWith(expect.objectContaining({ role: 'user' }))
  })
})
