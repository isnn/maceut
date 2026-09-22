import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/user.repository', () => ({
  findById: vi.fn(),
  findByIdWithPlan: vi.fn(),
  findByEmail: vi.fn(),
  emailTakenByOther: vi.fn(),
  updateEmail: vi.fn(),
  deleteById: vi.fn(),
  ensurePlan: vi.fn(),
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
vi.mock('../repositories/capture.repository', () => ({
  countsToday: vi.fn(async () => new Map()),
  countAllToday: vi.fn(async () => 0),
}))
vi.mock('../lib/auth', () => ({
  auth: { api: { signUpEmail: vi.fn() } },
}))
vi.mock('../lib/internal-access', () => ({
  isInternalByConfig: vi.fn(() => false),
  resolveRole: vi.fn((_email: string, stored: string) => stored),
  configuredInternalEmails: vi.fn(() => []),
}))

import { auth } from '../lib/auth'
import * as userRepo from '../repositories/user.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import * as captureRepo from '../repositories/capture.repository'
import {
  changeOwnPlan,
  changePlan,
  completeOnboarding,
  createUser,
  updateUserAsStaff,
  deleteUser,
  listUsers,
  getPlatformStats,
} from './user.service'
import {
  UpgradeNotSelfServeError,
  EmailAlreadyTakenError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors'
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
  vi.mocked(userRepo.findByEmail).mockResolvedValue(undefined as never)
  vi.mocked(auth.api.signUpEmail).mockResolvedValue({ user: { id: USER } } as never)
  vi.mocked(userRepo.findById).mockResolvedValue(row())
  vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row())
  vi.mocked(userRepo.listWithPlans).mockResolvedValue({ rows: [row()], total: 1 } as never)
  vi.mocked(zoneRepo.countsByUser).mockResolvedValue(new Map())
  vi.mocked(scheduleRepo.countsByUser).mockResolvedValue(new Map())
  vi.mocked(captureRepo.countsToday).mockResolvedValue(new Map())
  vi.mocked(captureRepo.countAllToday).mockResolvedValue(0)
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

  it('counts today’s captures per account', async () => {
    vi.mocked(captureRepo.countsToday).mockResolvedValue(new Map([[USER, 4]]))

    const { users } = await listUsers({ page: 1, limit: 25 })

    expect(users[0]!.usage.capturesToday).toBe(4)
  })

  it('leaves storage null — nothing measures it until images exist', async () => {
    const { users } = await listUsers({ page: 1, limit: 25 })

    // Zero would assert the account stored nothing, which is a different claim.
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

  it('counts captures taken today platform-wide', async () => {
    vi.mocked(captureRepo.countAllToday).mockResolvedValue(31)

    expect((await getPlatformStats()).capturesToday).toBe(31)
  })

  it('still reports storage as unmeasured', async () => {
    expect((await getPlatformStats()).storageUsedGb).toBeNull()
  })

  it('excludes internal accounts from the customer count', async () => {
    await getPlatformStats()

    // Staff are not customers: counting them inflates the total and, because the
    // frontend multiplies the plan mix by a price, invents revenue.
    expect(userRepo.listWithPlans).toHaveBeenCalledWith(expect.objectContaining({ role: 'user' }))
  })
})

describe('createUser — staff creating an account (F-21)', () => {
  it('goes through Better Auth rather than inserting a row', async () => {
    await createUser({ email: 'siti@example.com', fullName: 'Siti', plan: 'free', role: 'user' })

    // Hand-written INSERTs are how an account ends up existing but unable to sign in:
    // the credential row and its linkage have to be built the same way sign-up builds
    // them, and the password hashed by the same scrypt path.
    expect(auth.api.signUpEmail).toHaveBeenCalledWith({
      body: expect.objectContaining({ email: 'siti@example.com', name: 'Siti' }),
    })
  })

  it('generates a password when none is given, and returns it once', async () => {
    const out = await createUser({ email: 'siti@example.com', fullName: 'Siti', plan: 'free', role: 'user' })

    expect(out.temporaryPassword).toBeTypeOf('string')
    expect(out.temporaryPassword!.length).toBeGreaterThanOrEqual(16)
    // Whatever was generated is what the account was actually created with.
    const body = (vi.mocked(auth.api.signUpEmail).mock.calls[0]![0] as { body: { password: string } }).body
    expect(body.password).toBe(out.temporaryPassword)
  })

  it('never echoes a password the admin chose', async () => {
    const out = await createUser({
      email: 'siti@example.com',
      fullName: 'Siti',
      plan: 'free',
      role: 'user',
      password: 'chosen-by-the-admin',
    })

    // Returning it would put a password the admin already knows into logs and
    // responses for no gain. Only a generated one needs showing.
    expect(out.temporaryPassword).toBeUndefined()
    const body = (vi.mocked(auth.api.signUpEmail).mock.calls[0]![0] as { body: { password: string } }).body
    expect(body.password).toBe('chosen-by-the-admin')
  })

  it('refuses a duplicate email before touching Better Auth', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(row() as never)

    await expect(
      createUser({ email: 'budi@example.com', fullName: 'Budi', plan: 'free', role: 'user' }),
    ).rejects.toBeInstanceOf(EmailAlreadyTakenError)
    expect(auth.api.signUpEmail).not.toHaveBeenCalled()
  })

  it('applies the plan the admin picked', async () => {
    await createUser({ email: 'siti@example.com', fullName: 'Siti', plan: 'premium', role: 'user' })

    expect(userRepo.setPlan).toHaveBeenCalledWith(USER, 'premium')
  })

  it('can create staff', async () => {
    await createUser({ email: 'ops@maceut.id', fullName: 'Ops', plan: 'free', role: 'internal' })

    expect(userRepo.updateUser).toHaveBeenCalledWith(USER, expect.objectContaining({ role: 'internal' }))
  })

  it('skips onboarding — a person already set this account up', async () => {
    await createUser({ email: 'siti@example.com', fullName: 'Siti', plan: 'premium', role: 'user' })

    // Otherwise the welcome screen tells someone on a granted Premium plan they are on
    // Free, which is the one thing it exists to get right.
    expect(userRepo.updateUser).toHaveBeenCalledWith(USER, expect.objectContaining({ onboardingDone: true }))
  })

  it('fails loudly if Better Auth returns no user', async () => {
    vi.mocked(auth.api.signUpEmail).mockResolvedValue({} as never)

    await expect(
      createUser({ email: 'siti@example.com', fullName: 'Siti', plan: 'free', role: 'user' }),
    ).rejects.toThrow(/tidak mengembalikan user/)
    // Silently returning a half-made account is worse than an error: the admin would
    // hand over credentials for something that cannot sign in.
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })
})

describe('updateUserAsStaff — editing an account (F-22)', () => {
  const TARGET = 'user_02'

  beforeEach(() => {
    vi.mocked(userRepo.findById).mockResolvedValue(row({ id: TARGET }))
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(row({ id: TARGET }))
    vi.mocked(userRepo.emailTakenByOther).mockResolvedValue(false)
  })

  it('changes the name', async () => {
    await updateUserAsStaff(USER, TARGET, { fullName: 'Siti Baru' })

    expect(userRepo.updateUser).toHaveBeenCalledWith(TARGET, { name: 'Siti Baru' })
  })

  it('changes the email through the normalising path', async () => {
    await updateUserAsStaff(USER, TARGET, { email: 'Baru@Example.COM' })

    // updateEmail lowercases, because the unique index is on lower(email).
    expect(userRepo.updateEmail).toHaveBeenCalledWith(TARGET, 'Baru@Example.COM')
  })

  it('refuses an email another account already holds', async () => {
    vi.mocked(userRepo.emailTakenByOther).mockResolvedValue(true)

    await expect(updateUserAsStaff(USER, TARGET, { email: 'taken@example.com' })).rejects.toBeInstanceOf(
      EmailAlreadyTakenError,
    )
    expect(userRepo.updateEmail).not.toHaveBeenCalled()
  })

  it('refuses before writing anything else', async () => {
    vi.mocked(userRepo.emailTakenByOther).mockResolvedValue(true)

    await expect(
      updateUserAsStaff(USER, TARGET, { fullName: 'Renamed', email: 'taken@example.com' }),
    ).rejects.toBeInstanceOf(EmailAlreadyTakenError)
    // A rename that survived a rejected request would be a half-applied edit — worse
    // than nothing changing at all.
    expect(userRepo.updateUser).not.toHaveBeenCalled()
  })

  it('does not call changeRole when the role is unchanged', async () => {
    // A dialog submits the whole object. Without this, an admin renaming themselves
    // would be 403'd by changeRole's no-self-edit guard for a role they never touched.
    await updateUserAsStaff(TARGET, TARGET, { fullName: 'Self Rename', role: 'user' })

    expect(userRepo.updateUser).toHaveBeenCalledWith(TARGET, { name: 'Self Rename' })
  })

  it('still refuses an actual self role change', async () => {
    await expect(updateUserAsStaff(TARGET, TARGET, { role: 'internal' })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('reports plan impact only when the plan moves', async () => {
    const unchanged = await updateUserAsStaff(USER, TARGET, { fullName: 'X', plan: 'free' })
    expect(unchanged.impact).toBeNull()
    expect(userRepo.setPlan).not.toHaveBeenCalled()
  })

  it('runs the grandfather pass when the plan does move', async () => {
    const moved = await updateUserAsStaff(USER, TARGET, { plan: 'premium' })

    expect(userRepo.setPlan).toHaveBeenCalledWith(TARGET, 'premium')
    expect(moved.impact).not.toBeNull()
  })

  it('rejects an unknown account', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(undefined as never)

    await expect(updateUserAsStaff(USER, 'nobody', { fullName: 'X' })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('deleteUser — removing an account (F-22)', () => {
  const TARGET = 'user_02'

  beforeEach(() => {
    vi.mocked(userRepo.findById).mockResolvedValue(row({ id: TARGET }))
    vi.mocked(userRepo.countInternal).mockResolvedValue(2)
  })

  it('deletes once; the database cascades the rest', async () => {
    // Every table referencing user.id declares ON DELETE CASCADE, so there is no order
    // to get wrong and no second call to forget.
    await deleteUser(USER, TARGET)

    expect(userRepo.deleteById).toHaveBeenCalledWith(TARGET)
  })

  it('reports what went with the account', async () => {
    vi.mocked(zoneRepo.countsByUser).mockResolvedValue(new Map([[TARGET, { collecting: 2, paused: 1 }]]))
    vi.mocked(scheduleRepo.countsByUser).mockResolvedValue(new Map([[TARGET, { active: 3, paused: 1 }]]))

    const out = await deleteUser(USER, TARGET)

    // Paused rows count too — they are still the account's data and still disappear.
    expect(out.removed).toEqual({ zones: 3, schedules: 4 })
  })

  it('counts before deleting, not after', async () => {
    vi.mocked(zoneRepo.countsByUser).mockResolvedValue(new Map([[TARGET, { collecting: 2, paused: 0 }]]))

    const out = await deleteUser(USER, TARGET)

    expect(out.removed.zones).toBe(2)
  })

  it('refuses to delete yourself', async () => {
    // Unrecoverable through the API: the only fix would be editing the database.
    await expect(deleteUser(TARGET, TARGET)).rejects.toBeInstanceOf(ForbiddenError)
    expect(userRepo.deleteById).not.toHaveBeenCalled()
  })

  it('refuses to remove the last internal account', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(row({ id: TARGET, role: 'internal' }))
    vi.mocked(userRepo.countInternal).mockResolvedValue(1)

    await expect(deleteUser(USER, TARGET)).rejects.toBeInstanceOf(ValidationError)
    expect(userRepo.deleteById).not.toHaveBeenCalled()
  })

  it('allows removing an internal account while another remains', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(row({ id: TARGET, role: 'internal' }))
    vi.mocked(userRepo.countInternal).mockResolvedValue(2)

    await deleteUser(USER, TARGET)

    expect(userRepo.deleteById).toHaveBeenCalledWith(TARGET)
  })

  it('rejects an unknown account', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(undefined as never)

    await expect(deleteUser(USER, 'nobody')).rejects.toBeInstanceOf(NotFoundError)
  })
})
