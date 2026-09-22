import { randomBytes } from 'node:crypto'
import * as userRepo from '../repositories/user.repository'
import { auth } from '../lib/auth'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  UpgradeNotSelfServeError,
  EmailAlreadyTakenError,
  AppError,
} from '../errors'
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

/**
 * A strong temporary password, shown to the admin once and never stored in the clear.
 *
 * base64url over 18 random bytes: 24 characters, no ambiguous escaping, and safe to
 * paste into any field. Length is what carries the strength here — there is no point
 * in a character-class rule on a value nobody has to type from memory.
 */
function generatePassword(): string {
  return randomBytes(18).toString('base64url')
}

export interface CreateUserInput {
  email: string
  fullName: string
  plan: Plan
  role: PlatformRole
  /** Omit to have one generated and returned once. */
  password?: string
}

export interface CreatedUser {
  user: PublicUser
  /**
   * Present only when the server generated it. The admin has one chance to copy it: it
   * is hashed on the way into the database and cannot be read back afterwards.
   */
  temporaryPassword?: string
}

/**
 * Staff creating an account for a customer (F-21).
 *
 * The account goes through Better Auth's own sign-up rather than an INSERT, so the
 * password is hashed by the same scrypt path a self-registration uses and the account
 * row, the credential row and their linkage are all built the one correct way. Writing
 * those by hand is how an account ends up existing but unable to sign in.
 *
 * Two deliberate details:
 *
 * 1. Better Auth's `autoSignIn` mints a session for the new account. We do not forward
 *    it anywhere — the admin's own cookie is untouched, and the token is dropped rather
 *    than returned. The stray session simply expires.
 *
 * 2. `onboardingDone` is set true. An admin-created account has already been set up by
 *    a person, and the onboarding screen would tell someone on a granted Premium plan
 *    that they are on Free.
 */
export async function createUser(input: CreateUserInput): Promise<CreatedUser> {
  // Checked before Better Auth so the answer is this API's error contract rather than
  // Better Auth's, which the internal screens do not parse.
  const existing = await userRepo.findByEmail(input.email)
  if (existing) throw new EmailAlreadyTakenError()

  const generated = input.password ? undefined : generatePassword()
  const password = input.password ?? (generated as string)

  const created = await auth.api.signUpEmail({
    body: { email: input.email, password, name: input.fullName },
  })

  const userId = created?.user?.id
  if (!userId) {
    throw new AppError('INTERNAL_ERROR', 500, 'Akun gagal dibuat — Better Auth tidak mengembalikan user.')
  }

  await userRepo.ensurePlan(userId, input.plan)
  await userRepo.setPlan(userId, input.plan)
  await userRepo.updateUser(userId, { role: input.role, onboardingDone: true })

  return { user: await getUser(userId), temporaryPassword: generated }
}

/**
 * Sets an account's password on the operator's behalf, and signs it out everywhere.
 *
 * Hashing goes through Better Auth's own `password.hash` and `internalAdapter`, reached
 * via `auth.$context`, rather than writing the `account` row by hand. Better Auth owns
 * the hash format — scrypt with its own parameters — and a hand-rolled write would
 * produce a row that looks right and fails to verify, which only shows up when the
 * person tries to sign in.
 *
 * Existing sessions are revoked deliberately. The usual reason staff rotate a password
 * is that it leaked; leaving the old sessions alive would hand the new password to the
 * rightful owner while the other party stayed signed in.
 */
async function setPasswordAndRevokeSessions(userId: string, password: string): Promise<void> {
  const ctx = await (auth as unknown as { $context: Promise<AuthContext> }).$context
  const hashed = await ctx.password.hash(password)
  await ctx.internalAdapter.updatePassword(userId, hashed)
  await ctx.internalAdapter.deleteUserSessions(userId)
}

/** Only the slice of Better Auth's context this module uses. */
interface AuthContext {
  password: { hash: (plain: string) => Promise<string> }
  internalAdapter: {
    updatePassword: (userId: string, hashed: string) => Promise<unknown>
    deleteUserSessions: (userId: string) => Promise<unknown>
  }
}

export interface UpdateUserInput {
  fullName?: string
  email?: string
  plan?: Plan
  role?: PlatformRole
  password?: string
}

/**
 * Staff editing an account (F-22).
 *
 * Role and plan are applied through `changeRole` and `changePlan` rather than written
 * here, so there is exactly one place that knows the guards and the grandfather rule.
 * A second copy would be correct on the day it was written and wrong the first time a
 * rule changed.
 *
 * Order matters: the guards run before anything is written, so a request that will be
 * refused cannot leave a half-applied edit behind — an email changed but the role
 * rejected is worse than nothing changed at all.
 */
export interface StaffUpdateResult {
  user: PublicUser
  /** Only present when the plan actually moved; null otherwise (ADR-020). */
  impact: planService.PlanImpact | null
}

export async function updateUserAsStaff(
  actorId: string,
  targetUserId: string,
  input: UpdateUserInput,
): Promise<StaffUpdateResult> {
  const target = await userRepo.findById(targetUserId)
  if (!target) throw new NotFoundError('User')

  // --- refuse first, write second ---

  if (input.email && (await userRepo.emailTakenByOther(input.email, targetUserId))) {
    throw new EmailAlreadyTakenError()
  }

  // Changing your own email can move you out of INTERNAL_EMAILS and lock you out of the
  // staff area on the next sign-in — silently, since the column still says internal.
  if (input.email && actorId === targetUserId && isInternalByConfig(target.email)) {
    const stillConfigured = isInternalByConfig(input.email)
    if (!stillConfigured) {
      throw new ValidationError(
        'Email akun Anda sendiri terdaftar di INTERNAL_EMAILS. Mengubahnya akan mencabut akses staf Anda pada sign-in berikutnya.',
      )
    }
  }

  // --- writes ---

  if (input.fullName !== undefined) {
    await userRepo.updateUser(targetUserId, { name: input.fullName })
  }

  if (input.email !== undefined) {
    await userRepo.updateEmail(targetUserId, input.email)
  }

  if (input.password !== undefined) {
    await setPasswordAndRevokeSessions(targetUserId, input.password)
  }

  // Only when it actually moves. A dialog submits the whole object, so an unchanged
  // role would otherwise trip changeRole's no-self-edit guard and 403 an admin who was
  // only renaming themselves.
  if (input.role !== undefined && input.role !== resolveRole(target.email, (target.role ?? 'user') as PlatformRole)) {
    // Guards live in changeRole: no self-edit, config wins, never the last internal.
    await changeRole(actorId, targetUserId, input.role)
  } else if (input.email !== undefined) {
    // A new address can be in — or out of — INTERNAL_EMAILS, and the column is only a
    // cache of that. Re-resolving here means the directory does not show a stale role
    // until the account next signs in.
    const after = await userRepo.findById(targetUserId)
    if (after) {
      const resolved = resolveRole(after.email, (after.role ?? 'user') as PlatformRole)
      if (resolved !== after.role) await userRepo.updateUser(targetUserId, { role: resolved })
    }
  }

  // Plan last: it is the only field that can pause the account's zones and windows, and
  // its impact report is what the caller gets back. Skipped when unchanged — running
  // the grandfather pass for a plan that did not move is work with nothing to report.
  const currentPlan = (await userRepo.findByIdWithPlan(targetUserId))?.plan
  if (input.plan !== undefined && input.plan !== currentPlan) {
    return changePlan(targetUserId, input.plan)
  }

  return { user: await getUser(targetUserId), impact: null }
}

export interface DeleteUserResult {
  deleted: { id: string; email: string }
  /** What went with the account, so the caller can report it rather than guess. */
  removed: { zones: number; schedules: number }
}

/**
 * Deletes an account and everything belonging to it (F-22).
 *
 * ⚠️ Irreversible, and it takes the account's zones, capture windows and plan row with
 * it through ON DELETE CASCADE. There is no undo and no soft-delete fallback: the
 * caller is staff acting deliberately, and a half-deleted account that still owns
 * zones would be worse than either outcome.
 *
 * The same two guards as role changes, for the same reason — both are unrecoverable
 * through the API, and the only fix would be editing the database by hand.
 */
export async function deleteUser(actorId: string, targetUserId: string): Promise<DeleteUserResult> {
  const target = await userRepo.findById(targetUserId)
  if (!target) throw new NotFoundError('User')

  if (actorId === targetUserId) {
    throw new ForbiddenError('Anda tidak bisa menghapus akun Anda sendiri.')
  }

  const targetIsInternal = resolveRole(target.email, (target.role ?? 'user') as PlatformRole) === 'internal'
  if (targetIsInternal && (await userRepo.countInternal(configuredInternalEmails())) <= 1) {
    throw new ValidationError(
      'Ini satu-satunya akun internal yang tersisa — sistem tidak boleh kehilangan semua akses staf.',
    )
  }

  // Counted before the delete, because afterwards there is nothing left to count.
  const [zoneCounts, scheduleCounts] = await Promise.all([
    zoneRepo.countsByUser(),
    scheduleRepo.countsByUser(),
  ])
  const z = zoneCounts.get(targetUserId)
  const sc = scheduleCounts.get(targetUserId)

  await userRepo.deleteById(targetUserId)

  return {
    deleted: { id: target.id, email: target.email },
    removed: {
      zones: (z?.collecting ?? 0) + (z?.paused ?? 0),
      schedules: (sc?.active ?? 0) + (sc?.paused ?? 0),
    },
  }
}
