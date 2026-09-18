import type { Plan, PlatformRole } from '@/features/auth/types'

/** Usage figures shown per account in the directory and drawer. */
export interface AccountUsage {
  zonesCount: number
  zonesLimit: number
  capturesToday: number
  capturesLimit: number
  schedulesActiveCount: number
  schedulesLimit: number
  storageUsedGb: number
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
  /** The signed-in account — its usage is live rather than seeded. */
  isYou: boolean
  /** Seeded demo tenant; its usage figures are fabricated and never change. */
  isDemo: boolean
  usage: AccountUsage
}

export interface PlatformStats {
  totalAccounts: number
  internalUsers: number
  signupsLast7d: number
  byPlan: Record<Plan, number>
  zonesTotal: number
  capturesTodayTotal: number
  storageUsedGbTotal: number
  /** Estimated monthly recurring revenue, in rupiah. */
  mrr: number
}
