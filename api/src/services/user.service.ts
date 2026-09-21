import * as userRepo from '../repositories/user.repository'
import { NotFoundError, ForbiddenError, ValidationError, UpgradeNotSelfServeError } from '../errors'
import { isInternalByConfig, resolveRole, configuredInternalEmails } from '../lib/internal-access'
import { PLAN_LIMITS, isUpgrade, type Plan, type PlatformRole } from '../types/plan'
import * as planService from './plan.service'
import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'

/**
 * User records and platform administration (F-21, F-22).
 *
 * Creating accounts and signing in belong to Better Auth; this module owns everything
 * about a user that Better Auth does not — their plan, their platform role, and
 * whether onboarding is finished. Responses here use this API's `{ success, data }`
 * envelope, unlike `/api/auth/*`.
 */

/** What this API returns for a user. Never includes the password hash. */
export interface PublicUser {
  id: string
  email: string
  fullName: string
  plan: Plan
  role: PlatformRole
  onboardingDone: boolean
  createdAt: string
}

/**
 * Better Auth calls it `name`; the frontend's User model and every screen call it
 * `fullName`. Mapping here keeps one rename in one place instead of leaking Better
 * Auth's vocabulary into the UI.
 */
export function toPublic(row: userRepo.UserWithPlan): PublicUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.name,
    plan: row.plan,
    // The stored column is a cache; config is the authority (BR-027).
    role: resolveRole(row.email, (row.role ?? 'user') as PlatformRole),
    onboardingDone: row.onboardingDone ?? false,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function getUser(userId: string): Promise<PublicUser> {
  const found = await userRepo.findByIdWithPlan(userId)
  if (!found) throw new NotFoundError('User')
  return toPublic(found)
}

/**
 * Called after sign-in and on /me.
 *
 * Two things are reconciled here rather than at sign-up, because Better Auth creates
 * the account without knowing about our tables: the plan row (BR-001, every account
 * starts free) and the platform role, which follows INTERNAL_EMAILS and so can change
 * between one sign-in and the next without anyone touching the database.
 */
export async function reconcileAfterSignIn(userId: string): Promise<PublicUser> {
  const found = await userRepo.findById(userId)
  if (!found) throw new NotFoundError('User')

  await userRepo.ensurePlan(userId, 'free')

  const resolved = resolveRole(found.email, (found.role ?? 'user') as PlatformRole)
  if (resolved !== found.role) {
    await userRepo.updateUser(userId, { role: resolved })
  }

  return getUser(userId)
}

/**
 * Step 2 of sign-up: onboarding marked done. The plan is not a parameter.
 *
 * Every account starts on Free and a paid plan is granted by staff from
 * `/internal/users`. Until billing exists, a plan picker at sign-up is not a sale — it
 * is a form that hands out Premium limits to anyone who reads the pricing page. The
 * account already has its `free` plan row from registration, so there is nothing to
 * set here.
 *
 * No impact pass — a brand-new account has nothing to pause.
 */
export async function completeOnboarding(userId: string): Promise<PublicUser> {
  const found = await userRepo.findById(userId)
  if (!found) throw new NotFoundError('User')

  await userRepo.updateUser(userId, { onboardingDone: true })

  return getUser(userId)
}

export interface PlanChangeResult {
  user: PublicUser
  impact: planService.PlanImpact
}

/** What a move to `plan` would pause, without changing anything (ADR-020). */
export async function previewPlanChange(userId: string, plan: Plan): Promise<planService.PlanImpact> {
  const found = await userRepo.findById(userId)
  if (!found) throw new NotFoundError('User')
  return planService.previewPlanChange(userId, plan)
}

/**
 * A user changing their own plan — downwards only, until billing exists.
 *
 * An upgrade gains capacity that nobody has paid for, so it is refused here and
 * granted by staff from `/internal/users` instead, where there is a record of who
 * granted what. This used to be ungated, which meant any account could hand itself
 * premium limits by picking a card.
 *
 * A downgrade stays self-serve on purpose: giving up capacity costs the business
 * nothing, and making someone file a ticket in order to spend less is hostile. It
 * still runs the full grandfather-and-block pass (ADR-020).
 *
 * When billing lands, the upgrade path becomes: create a payment intent, and move the
 * plan only on a confirmed payment webhook — not by relaxing this check.
 */
export async function changeOwnPlan(userId: string, plan: Plan): Promise<PlanChangeResult> {
  const found = await userRepo.findById(userId)
  if (!found) throw new NotFoundError('User')

  const current = await userRepo.findByIdWithPlan(userId)
  if (current && isUpgrade(current.plan, plan)) throw new UpgradeNotSelfServeError(plan)

  await userRepo.setPlan(userId, plan)
  // Grandfather and block (ADR-020): pause what no longer fits, delete nothing.
  const impact = await planService.applyPlanChange(userId, plan)

  return { user: await getUser(userId), impact }
}

export interface ListUsersParams {
  search?: string
  plan?: Plan
  role?: PlatformRole
  page: number
  limit: number
  sort?: 'created_desc' | 'created_asc' | 'email_asc'
}

/**
 * What an account is actually using, for the internal directory.
 *
 * Zones and windows are measured. Captures and storage are `null` because no table
 * counts them yet (CAP-01) — an operator tool that invents numbers is worse than one
 * that admits it does not know, because the invented ones get acted on.
 */
export interface AccountUsage {
  zonesCount: number
  zonesPaused: number
  schedulesActiveCount: number
  schedulesPaused: number
  capturesToday: number | null
  storageUsedGb: number | null
}

export interface UserWithUsage extends PublicUser {
  usage: AccountUsage
}

export interface ListUsersResult {
  users: UserWithUsage[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function listUsers(params: ListUsersParams): Promise<ListUsersResult> {
  const { rows, total } = await userRepo.listWithPlans({
    search: params.search,
    plan: params.plan,
    role: params.role,
    // Passed through so the SQL filter agrees with the role each row renders with.
    internalEmails: configuredInternalEmails(),
    limit: params.limit,
    offset: (params.page - 1) * params.limit,
    sort: params.sort,
  })

  // Two grouped queries for the whole page, not two per row — the directory lists
  // every account, so per-row counting would slow down with every signup.
  const [zoneCounts, scheduleCounts] = await Promise.all([
    zoneRepo.countsByUser(),
    scheduleRepo.countsByUser(),
  ])

  return {
    users: rows.map((row) => {
      const z = zoneCounts.get(row.id)
      const sc = scheduleCounts.get(row.id)
      return {
        ...toPublic(row),
        usage: {
          zonesCount: z?.collecting ?? 0,
          zonesPaused: z?.paused ?? 0,
          schedulesActiveCount: sc?.active ?? 0,
          schedulesPaused: sc?.paused ?? 0,
          capturesToday: null,
          storageUsedGb: null,
        },
      }
    }),
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
  }
}

/** Staff changing a customer's plan from /internal. Same grandfather rule. */
export async function changePlan(userId: string, plan: Plan): Promise<PlanChangeResult> {
  const found = await userRepo.findById(userId)
  if (!found) throw new NotFoundError('User')

  await userRepo.setPlan(userId, plan)
  const impact = await planService.applyPlanChange(userId, plan)

  return { user: await getUser(userId), impact }
}

/**
 * Changing someone's platform role, with three guards.
 *
 * Two of them exist to stop the platform locking itself out, which is unrecoverable
 * through the API — the only fix would be editing the database by hand.
 */
export async function changeRole(actorId: string, targetUserId: string, role: PlatformRole): Promise<PublicUser> {
  const target = await userRepo.findById(targetUserId)
  if (!target) throw new NotFoundError('User')

  // 1. No editing your own role. Otherwise one compromised staff session could
  //    quietly demote everyone else and keep itself, or lock itself out by accident.
  if (actorId === targetUserId) {
    throw new ForbiddenError('Anda tidak bisa mengubah role akun Anda sendiri.')
  }

  // 2. Config wins (BR-027). An address in INTERNAL_EMAILS cannot be demoted here —
  //    it would be re-promoted at the next sign-in, so the UI would be reporting a
  //    change that does not hold.
  if (isInternalByConfig(target.email) && role !== 'internal') {
    throw new ValidationError(
      'Role akun ini ditentukan oleh INTERNAL_EMAILS di konfigurasi server. Hapus emailnya dari daftar itu untuk mencabut akses.',
      { configuredEmails: configuredInternalEmails().length },
    )
  }

  // 3. Never remove the last internal account. Uses the resolved role, not the
  //    cached column, so the count and the check agree on who counts as staff.
  if (resolveRole(target.email, (target.role ?? 'user') as PlatformRole) === 'internal' && role !== 'internal') {
    if ((await userRepo.countInternal(configuredInternalEmails())) <= 1) {
      throw new ValidationError(
        'Ini satu-satunya akun internal yang tersisa — sistem tidak boleh kehilangan semua akses staf.',
      )
    }
  }

  await userRepo.updateUser(targetUserId, { role })
  return getUser(targetUserId)
}

/** Aggregate figures for the /internal overview (F-21). */
export async function getPlatformStats(): Promise<{
  totalUsers: number
  internalUsers: number
  planMix: Record<Plan, number>
  estimatedSeats: number
  /** Measured platform-wide. Captures and storage stay null until CAP-01. */
  zonesCollecting: number
  schedulesActive: number
  capturesToday: number | null
  storageUsedGb: number | null
}> {
  // One page large enough to aggregate over. Fine at this scale; when it stops being
  // fine the answer is a SQL GROUP BY in the repository, not a bigger page.
  // `role: 'user'` excludes staff. Maceut employees are not customers: counting them
  // inflates the account total, and the frontend multiplies the plan mix by a monthly
  // price, so an internal account on a paid plan would invent revenue that does not
  // exist.
  const { rows, total } = await userRepo.listWithPlans({
    role: 'user',
    internalEmails: configuredInternalEmails(),
    limit: 10_000,
    offset: 0,
  })

  const planMix: Record<Plan, number> = { free: 0, standard: 0, premium: 0 }
  let estimatedSeats = 0
  for (const row of rows) {
    planMix[row.plan] += 1
    estimatedSeats += PLAN_LIMITS[row.plan].seatsLimit
  }

  const [internalUsers, zonesCollecting, schedulesActive] = await Promise.all([
    userRepo.countInternal(configuredInternalEmails()),
    zoneRepo.countAllCollecting(),
    scheduleRepo.countAllActive(),
  ])

  return {
    totalUsers: total,
    internalUsers,
    planMix,
    estimatedSeats,
    zonesCollecting,
    schedulesActive,
    // No table counts these yet (CAP-01). Null travels to the UI as "—" rather than
    // a zero, which would claim nothing was captured — a different statement.
    capturesToday: null,
    storageUsedGb: null,
  }
}
