import { eq, ne, sql, desc, asc, and, ilike, or, not, type SQL } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { user, userPlans, type UserPlanRow } from '../../drizzle/schema'
import type { Plan, PlatformRole } from '../types/plan'

/**
 * Data access only — no business rules. Those live in the service layer (BR-007).
 *
 * Reads and writes Better Auth's `user` table. Creating users, hashing passwords and
 * issuing sessions all belong to Better Auth; this file only reads users back and
 * edits the app-owned columns (role, onboardingDone) and the `user_plans` row.
 */

export type UserRow = typeof user.$inferSelect

export interface UserWithPlan extends UserRow {
  plan: Plan
  /** End of a paid period (FE-56); NULL/absent = the plan does not expire. */
  planExpiresAt?: Date | null
  /** A Midtrans card Subscription renews the plan (FE-56 phase 5). */
  autoRenew?: boolean
  midtransSubscriptionId?: string | null
}

/**
 * Email lookups go through lower() so they match the functional unique index in
 * migration 0001. `eq(user.email, ...)` would be case-sensitive and could miss an
 * account whose address was stored with different capitalisation.
 */
export async function findByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(user)
    .where(sql`lower(${user.email}) = lower(${email})`)
    .limit(1)
  return rows[0]
}

export async function findById(id: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(user).where(eq(user.id, id)).limit(1)
  return rows[0]
}

export async function findByIdWithPlan(id: string): Promise<UserWithPlan | undefined> {
  const rows = await db
    .select({
      u: user,
      plan: userPlans.plan,
      planExpiresAt: userPlans.expiresAt,
      autoRenew: userPlans.autoRenew,
      midtransSubscriptionId: userPlans.midtransSubscriptionId,
    })
    .from(user)
    .leftJoin(userPlans, eq(userPlans.userId, user.id))
    .where(eq(user.id, id))
    .limit(1)

  const row = rows[0]
  if (!row) return undefined
  // A user with no plan row falls back to free (BR-001) rather than erroring — an
  // empty join is a data problem, not a reason to lock someone out of their account.
  return {
    ...row.u,
    plan: (row.plan ?? 'free') as Plan,
    planExpiresAt: row.planExpiresAt ?? null,
    autoRenew: row.autoRenew ?? false,
    midtransSubscriptionId: row.midtransSubscriptionId ?? null,
  }
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<UserRow, 'name' | 'role' | 'staffType' | 'onboardingDone' | 'emailVerified'>>,
): Promise<UserRow | undefined> {
  const rows = await db
    .update(user)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning()
  return rows[0]
}

/**
 * Change an account's email, case-insensitively unique across the table.
 *
 * Separate from `updateUser` because email is the sign-in identifier, not an ordinary
 * attribute: the unique index is on `lower(email)` (migration 0001), so the value is
 * normalised here rather than trusting every caller to remember.
 */
export async function updateEmail(id: string, email: string): Promise<UserRow | undefined> {
  const rows = await db
    .update(user)
    .set({ email: email.trim().toLowerCase(), updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning()
  return rows[0]
}

/** True when another account already uses this address. Excludes `exceptId`. */
export async function emailTakenByOther(email: string, exceptId: string): Promise<boolean> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(sql`lower(${user.email}) = lower(${email})`, ne(user.id, exceptId)))
    .limit(1)
  return rows.length > 0
}

/**
 * Remove an account and everything hanging off it.
 *
 * Every table that references `user.id` declares ON DELETE CASCADE — user_plans,
 * zones, schedules, and Better Auth's session and account rows — so one delete is the
 * whole operation and there is no order to get wrong. Confirmed against the schema
 * rather than assumed; a missing cascade would leave an orphan row that blocks the
 * delete with a foreign-key error rather than silently succeeding.
 */
export async function deleteById(id: string): Promise<void> {
  await db.delete(user).where(eq(user.id, id))
}

/**
 * Sets the account's plan. `expiresAt` is the end of a paid period (FE-56); every
 * other caller — staff, a self-serve downgrade, sign-up — leaves it NULL, which means
 * the plan does not expire. `keepStartedAt` is for a renewal of the same plan, which
 * extends the period without restarting "on this plan since".
 */
export async function setPlan(
  userId: string,
  plan: Plan,
  opts: { expiresAt?: Date | null; keepStartedAt?: boolean } = {},
): Promise<UserPlanRow | undefined> {
  const expiresAt = opts.expiresAt ?? null
  const rows = await db
    .update(userPlans)
    .set(opts.keepStartedAt ? { plan, expiresAt, remindedAt: null } : { plan, expiresAt, remindedAt: null, startedAt: new Date() })
    .where(eq(userPlans.userId, userId))
    .returning()

  if (rows[0]) return rows[0]

  // No plan row yet — every account created through Better Auth starts without one,
  // since Better Auth does not know about our tables. Create it rather than silently
  // doing nothing and leaving the account plan-less forever.
  const created = await db.insert(userPlans).values({ userId, plan, expiresAt }).returning()
  return created[0]
}

/** The plan row itself (start and expiry), for the staff Billing section. */
/**
 * A paid period has ended: back to Free, once. Conditional on the exact end date it
 * read, so two requests noticing the expiry together move it once — and a renewal that
 * landed in between (new end date) is not undone.
 */
export async function expireToFree(userId: string, expiresAt: Date): Promise<UserPlanRow | undefined> {
  const [row] = await db
    .update(userPlans)
    .set({ plan: 'free', expiresAt: null, remindedAt: null, startedAt: new Date() })
    .where(and(eq(userPlans.userId, userId), eq(userPlans.expiresAt, expiresAt), ne(userPlans.plan, 'free')))
    .returning()
  return row
}

/** Paid periods ending in (from, to] whose reminder hasn't gone out. */
export async function findExpiringUnreminded(
  from: Date,
  to: Date,
): Promise<{ userId: string; plan: Plan; expiresAt: Date }[]> {
  const rows = await db
    .select({ userId: userPlans.userId, plan: userPlans.plan, expiresAt: userPlans.expiresAt })
    .from(userPlans)
    .where(
      and(
        ne(userPlans.plan, 'free'),
        sql`${userPlans.expiresAt} > ${from}`,
        sql`${userPlans.expiresAt} <= ${to}`,
        sql`${userPlans.remindedAt} IS NULL`,
        // Auto-renew accounts are charged, not reminded.
        eq(userPlans.autoRenew, false),
      ),
    )
  return rows.map((r) => ({ userId: r.userId, plan: r.plan as Plan, expiresAt: r.expiresAt! }))
}

/** Marks this period's reminder sent — only if the period is still the one reminded about. */
export async function markReminded(userId: string, expiresAt: Date, at: Date): Promise<boolean> {
  const rows = await db
    .update(userPlans)
    .set({ remindedAt: at })
    .where(and(eq(userPlans.userId, userId), eq(userPlans.expiresAt, expiresAt), sql`${userPlans.remindedAt} IS NULL`))
    .returning({ id: userPlans.id })
  return rows.length > 0
}

/** Turns auto-renew on (with its subscription) or off. */
export async function setAutoRenew(userId: string, subscriptionId: string | null): Promise<void> {
  await db
    .update(userPlans)
    .set({ autoRenew: subscriptionId !== null, midtransSubscriptionId: subscriptionId })
    .where(eq(userPlans.userId, userId))
}

/** The account a Midtrans Subscription belongs to. */
export async function findBySubscriptionId(
  subscriptionId: string,
): Promise<{ userId: string; plan: Plan; expiresAt: Date | null } | undefined> {
  const [row] = await db
    .select({ userId: userPlans.userId, plan: userPlans.plan, expiresAt: userPlans.expiresAt })
    .from(userPlans)
    .where(eq(userPlans.midtransSubscriptionId, subscriptionId))
    .limit(1)
  return row ? { userId: row.userId, plan: row.plan as Plan, expiresAt: row.expiresAt } : undefined
}

/** A renewal charge landed: same plan, new end date, and a fresh reminder slot. */
export async function extendPaidPeriod(userId: string, expiresAt: Date): Promise<void> {
  await db.update(userPlans).set({ expiresAt, remindedAt: null }).where(eq(userPlans.userId, userId))
}

export async function findPlanRow(userId: string): Promise<UserPlanRow | undefined> {
  const rows = await db.select().from(userPlans).where(eq(userPlans.userId, userId)).limit(1)
  return rows[0]
}

/** BR-001: ensure a newly registered account has a plan row. Idempotent. */
export async function ensurePlan(userId: string, plan: Plan = 'free'): Promise<void> {
  await db.insert(userPlans).values({ userId, plan }).onConflictDoNothing({ target: userPlans.userId })
}

/**
 * Escapes the characters LIKE treats as wildcards, so a search term matches itself.
 *
 * Without this, searching `%` matched every account and `_` matched any single
 * character — a staff member looking for a literal underscore in an email got the
 * whole table back. Backslash is Postgres's default LIKE escape character, so no
 * explicit ESCAPE clause is needed; it has to be escaped first or it would escape
 * the escapes.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&')
}

/**
 * "Is this account internal?" expressed in SQL.
 *
 * The `role` column is only a cache — an address in INTERNAL_EMAILS is internal even
 * when the column still says `user`, because nothing writes the column until that
 * account next signs in. Filtering on the column alone made the list contradict
 * itself: a newly-listed staff member rendered as `internal` but was returned by
 * `?role=user` and missing from `?role=internal`.
 *
 * So the predicate has to mirror `resolveRole()` exactly: column OR config.
 */
function isInternalSql(internalEmails: readonly string[]): SQL {
  const byColumn = eq(user.role, 'internal')
  if (internalEmails.length === 0) return byColumn

  const byConfig = sql`lower(${user.email}) = ANY(${sql.param(internalEmails)})`
  return or(byColumn, byConfig) as SQL
}

export interface ListUsersOptions {
  search?: string
  plan?: Plan
  role?: PlatformRole
  /** From config. Required for `role` filtering to agree with what the rows display. */
  internalEmails: readonly string[]
  limit: number
  offset: number
  sort?: 'created_desc' | 'created_asc' | 'email_asc'
}

export async function listWithPlans(opts: ListUsersOptions): Promise<{ rows: UserWithPlan[]; total: number }> {
  const filters: SQL[] = []

  if (opts.search) {
    const term = `%${escapeLike(opts.search)}%`
    const clause = or(ilike(user.email, term), ilike(user.name, term))
    if (clause) filters.push(clause)
  }
  if (opts.plan) filters.push(eq(userPlans.plan, opts.plan))
  if (opts.role === 'internal') filters.push(isInternalSql(opts.internalEmails))
  if (opts.role === 'user') filters.push(not(isInternalSql(opts.internalEmails)))

  const where = filters.length > 0 ? and(...filters) : undefined

  const orderBy = {
    created_desc: desc(user.createdAt),
    created_asc: asc(user.createdAt),
    email_asc: asc(user.email),
  }[opts.sort ?? 'created_desc']

  const rows = await db
    .select({ u: user, plan: userPlans.plan })
    .from(user)
    .leftJoin(userPlans, eq(userPlans.userId, user.id))
    .where(where)
    .orderBy(orderBy)
    .limit(opts.limit)
    .offset(opts.offset)

  // Counted with the same filters and the same join, so the total matches the list
  // rather than reporting every account regardless of the filter in effect.
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .leftJoin(userPlans, eq(userPlans.userId, user.id))
    .where(where)

  return {
    rows: rows.map((r) => ({ ...r.u, plan: (r.plan ?? 'free') as Plan })),
    total: countRows[0]?.count ?? 0,
  }
}

/**
 * How many accounts are internal *in effect* — column or config.
 *
 * Counting the column alone under-reports: a staff address added to INTERNAL_EMAILS
 * counts from that moment, not from whenever that person next signs in. The
 * last-internal-account guard depends on this being right.
 */
export async function countInternal(internalEmails: readonly string[]): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(isInternalSql(internalEmails))
  return rows[0]?.count ?? 0
}

/**
 * Superadmins (FE-34): config-granted staff, plus database staff stored as superadmin.
 * Guards use it so the platform can never be left without one.
 */
export async function countSuperadmins(internalEmails: readonly string[]): Promise<number> {
  const stored = and(eq(user.role, 'internal'), eq(user.staffType, 'superadmin')) as SQL
  const where =
    internalEmails.length === 0 ? stored : (or(stored, sql`lower(${user.email}) = ANY(${sql.param(internalEmails)})`) as SQL)
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(user).where(where)
  return rows[0]?.count ?? 0
}

/** Ids of every staff account — the recipients of staff-only notifications. */
export async function listInternalIds(internalEmails: readonly string[]): Promise<string[]> {
  const rows = await db.select({ id: user.id }).from(user).where(isInternalSql(internalEmails))
  return rows.map((r) => r.id)
}
