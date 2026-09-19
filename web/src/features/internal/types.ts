import type { Plan, PlatformRole } from '@/features/auth/types'

/**
 * Usage figures shown per account in the directory and drawer.
 *
 * Counts are nullable because zones, captures and storage have no tables yet — there
 * is nothing to count, and `null` renders as "—". Limits are always known: they come
 * from the account's plan. When those features ship the counts become numbers and
 * nothing else here changes.
 */
export interface AccountUsage {
  zonesCount: number | null
  zonesLimit: number
  capturesToday: number | null
  capturesLimit: number
  schedulesActiveCount: number | null
  schedulesLimit: number
  storageUsedGb: number | null
  storageLimitGb: number
}

export interface InternalUserRow {
  id: string
  fullName: string
  email: string
  organisation: string
  plan: Plan
  role: PlatformRole
  createdAt: string
  /** The signed-in account — shown with a "you" marker and locked against self-edits. */
  isYou: boolean
  usage: AccountUsage
}

export interface PlatformStats {
  totalAccounts: number
  internalUsers: number
  signupsLast7d: number
  byPlan: Record<Plan, number>
  /** Null until zones/captures/storage exist. See AccountUsage. */
  zonesTotal: number | null
  capturesTodayTotal: number | null
  storageUsedGbTotal: number | null
  /** Estimated monthly recurring revenue, in rupiah, derived from the plan mix. */
  mrr: number
}
