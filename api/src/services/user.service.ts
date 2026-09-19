import * as userRepo from '../repositories/user.repository'
import { NotFoundError, ForbiddenError, ValidationError } from '../errors'
import { isInternalByConfig, resolveRole, configuredInternalEmails } from '../lib/internal-access'
import { PLAN_LIMITS, type Plan, type PlatformRole } from '../types/plan'

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
  organisation: string | null
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
    organisation: row.organisation ?? null,
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

/** Step 2 of sign-up: the chosen plan, and onboarding marked done. */
export async function completeOnboarding(userId: string, plan: Plan): Promise<PublicUser> {
  const found = await userRepo.findById(userId)
  if (!found) throw new NotFoundError('User')

  await userRepo.setPlan(userId, plan)
  await userRepo.updateUser(userId, { onboardingDone: true })

  return getUser(userId)
}

export interface ListUsersParams {
  search?: string
  plan?: Plan
  role?: PlatformRole
  page: number
  limit: number
  sort?: 'created_desc' | 'created_asc' | 'email_asc'
}

export interface ListUsersResult {
  users: PublicUser[]
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
    limit: params.limit,
    offset: (params.page - 1) * params.limit,
    sort: params.sort,
  })

  return {
    users: rows.map(toPublic),
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
  }
}

export async function changePlan(userId: string, plan: Plan): Promise<PublicUser> {
  const found = await userRepo.findById(userId)
  if (!found) throw new NotFoundError('User')

  await userRepo.setPlan(userId, plan)
  return getUser(userId)
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

  // 3. Never remove the last internal account.
  if (target.role === 'internal' && role !== 'internal') {
    if ((await userRepo.countByRole('internal')) <= 1) {
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
}> {
  // One page large enough to aggregate over. Fine at this scale; when it stops being
  // fine the answer is a SQL GROUP BY in the repository, not a bigger page.
  const { rows, total } = await userRepo.listWithPlans({ limit: 10_000, offset: 0 })

  const planMix: Record<Plan, number> = { free: 0, standard: 0, premium: 0 }
  let estimatedSeats = 0
  for (const row of rows) {
    planMix[row.plan] += 1
    estimatedSeats += PLAN_LIMITS[row.plan].seatsLimit
  }

  return {
    totalUsers: total,
    internalUsers: await userRepo.countByRole('internal'),
    planMix,
    estimatedSeats,
  }
}
