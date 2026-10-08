import { config } from '../config/env'
import type { Access, PlatformRole, StaffType } from '../types/plan'

/**
 * Who gets the `internal` platform role (BR-027).
 *
 * Config is a **floor, not a ceiling**. An address listed in INTERNAL_EMAILS is
 * always internal and cannot be demoted through the API. An address not listed keeps
 * whatever the database says, so staff can be promoted at runtime from
 * `/internal/users` without a redeploy.
 *
 * The alternative — config as the sole authority — was tried and is wrong: it makes
 * the promote path in `changeRole` dead code, since every DB-granted role would be
 * stripped again on the next read.
 *
 * What this means for revoking access, precisely: removing someone from
 * INTERNAL_EMAILS is NOT enough on its own if they were also promoted in the
 * database. Revoking takes both — remove the address *and* demote the account. There
 * is deliberately no single switch, because one would either break runtime promotion
 * or let a config edit be silently overridden by a stale row.
 *
 * The only copy. The web app used to keep its own in NEXT_PUBLIC_INTERNAL_EMAILS —
 * bundled into every browser, and free to disagree with this one; it now reads a
 * per-user `roleLockedByConfig` flag from the API instead.
 */
export function isInternalByConfig(email: string): boolean {
  return config.internalEmails.includes(email.trim().toLowerCase())
}

/** The role an account has right now: config grants, otherwise the stored value stands. */
export function resolveRole(email: string, storedRole: PlatformRole): PlatformRole {
  return isInternalByConfig(email) ? 'internal' : storedRole
}

export function configuredInternalEmails(): readonly string[] {
  return config.internalEmails
}

/**
 * The staff type an account has right now (FE-34). Config-granted staff are always
 * superadmins — INTERNAL_EMAILS is the platform's root of trust. A database-granted staff
 * account without a stored type counts as an admin, the lesser of the two: a missing
 * value must never widen access.
 */
export function resolveStaffType(email: string, storedRole: PlatformRole, storedType: string | null): StaffType | null {
  if (resolveRole(email, storedRole) !== 'internal') return null
  if (isInternalByConfig(email)) return 'superadmin'
  return storedType === 'superadmin' ? 'superadmin' : 'admin'
}

/** Customer, admin or superadmin, from a user row. */
export function accessOf(row: { email: string; role: string | null; staffType?: string | null }): Access {
  return resolveStaffType(row.email, (row.role ?? 'user') as PlatformRole, row.staffType ?? null) ?? 'user'
}

/** The stored columns for an access level. */
export function columnsFor(access: Access): { role: PlatformRole; staffType: StaffType | null } {
  return access === 'user' ? { role: 'user', staffType: null } : { role: 'internal', staffType: access }
}
