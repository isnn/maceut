import { eq, sql, desc, asc, and, ilike, or, not, type SQL } from 'drizzle-orm'
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
    .select({ u: user, plan: userPlans.plan })
    .from(user)
    .leftJoin(userPlans, eq(userPlans.userId, user.id))
    .where(eq(user.id, id))
    .limit(1)

  const row = rows[0]
  if (!row) return undefined
  // A user with no plan row falls back to free (BR-001) rather than erroring — an
  // empty join is a data problem, not a reason to lock someone out of their account.
  return { ...row.u, plan: (row.plan ?? 'free') as Plan }
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<UserRow, 'name' | 'role' | 'onboardingDone'>>,
): Promise<UserRow | undefined> {
  const rows = await db
    .update(user)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning()
  return rows[0]
}

export async function setPlan(userId: string, plan: Plan): Promise<UserPlanRow | undefined> {
  const rows = await db
    .update(userPlans)
    .set({ plan, startedAt: new Date() })
    .where(eq(userPlans.userId, userId))
    .returning()

  if (rows[0]) return rows[0]

  // No plan row yet — every account created through Better Auth starts without one,
  // since Better Auth does not know about our tables. Create it rather than silently
  // doing nothing and leaving the account plan-less forever.
  const created = await db.insert(userPlans).values({ userId, plan }).returning()
  return created[0]
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
