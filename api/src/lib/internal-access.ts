import { config } from '../config/env'
import type { PlatformRole } from '../types/plan'

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
 * The frontend has its own NEXT_PUBLIC_INTERNAL_EMAILS, but that is bundled into the
 * browser and only decides what to render. This one is the authority.
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
