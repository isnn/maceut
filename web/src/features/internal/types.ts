import type { Plan, PlatformRole } from '@/features/auth/types'

/**
 * Usage figures shown per account in the directory and drawer.
 *
 * Zones and capture windows are measured by the server. Captures and storage are still
 * `null` because no table counts them (CAP-01), and `null` renders as "—" rather than
 * a zero that would claim the account captured nothing. Limits always come from the
 * account's plan.
 *
 * `zonesPaused` / `schedulesPaused` are what a downgrade left behind (ADR-020) — an
 * operator looking at a complaint needs to see that before anything else.
 */
export interface AccountUsage {
  zonesCount: number
  zonesPaused: number
  zonesLimit: number
  capturesToday: number | null
  capturesLimit: number
  schedulesActiveCount: number
  schedulesPaused: number
  schedulesLimit: number
  storageUsedGb: number | null
  storageLimitGb: number
}

export interface InternalUserRow {
  id: string
  fullName: string
  email: string
  plan: Plan
  role: PlatformRole
  /** Staff by INTERNAL_EMAILS — can't be demoted here (BR-027). Decided by the server. */
  roleLockedByConfig: boolean
  createdAt: string
  /** The signed-in account — shown with a "you" marker and locked against self-edits. */
  isYou: boolean
  usage: AccountUsage
}

export interface PlatformStats {
  totalAccounts: number
  internalUsers: number
  /** Addresses the server's INTERNAL_EMAILS grants. */
  internalByConfig: number
  signupsLast7d: number
  byPlan: Record<Plan, number>
  /** Measured. Captures and storage stay null until CAP-01 — see AccountUsage. */
  zonesTotal: number
  schedulesActiveTotal: number
  capturesTodayTotal: number | null
  storageUsedGbTotal: number | null
  /** Estimated monthly recurring revenue, in rupiah, derived from the plan mix. */
  mrr: number
}
