/**
 * Platform administration, against the real backend
 * (GET /internal/users, GET /internal/stats, PATCH /internal/users/:id/{plan,role}).
 *
 * The 24 seeded demo tenants are gone. They existed so these screens had something to
 * show before a backend did; now the directory lists the accounts that actually exist,
 * and a quiet screen is the truth rather than a bug.
 *
 * Per-account usage went with them. Zones, captures and storage have no tables yet, so
 * there is nothing to count — the limits below come from the account's plan and the
 * counts are `null`, which the UI renders as "—". Reporting fabricated numbers in an
 * operator tool is worse than reporting none.
 */

import { PLAN_LIMITS, PLAN_PRICE } from '@/lib/constants'
import { apiClient } from '@/lib/api-client'
import type { Plan, PlatformRole, User } from '@/features/auth/types'
import type { AccountUsage, InternalUserRow, PlatformStats } from './types'

/** Rupiah per month, used for the MRR estimate on the overview. */
const PLAN_MONTHLY_IDR: Record<Plan, number> = { free: 0, standard: 490_000, premium: 1_900_000 }

/** Server caps limit at 100 per page; the directory pages through to build the table. */
const PAGE_SIZE = 100
const MAX_PAGES = 50

interface PaginationMeta {
  total: number
  page: number
  limit: number
  total_pages: number
}

async function fetchAllUsers(): Promise<User[]> {
  const all: User[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, meta } = await apiClient.getWithMeta<User[]>(
      `/internal/users?page=${page}&limit=${PAGE_SIZE}&sort=created_desc`,
    )
    all.push(...data)

    const m = meta as PaginationMeta | undefined
    if (!m || page >= m.total_pages) break
  }
  return all
}

/** Limits from the plan; counts unknown until zones and captures exist. */
function usageFor(plan: Plan): AccountUsage {
  const limits = PLAN_LIMITS[plan]
  return {
    zonesCount: null,
    zonesLimit: limits.zonesLimit,
    capturesToday: null,
    capturesLimit: limits.capturesLimit,
    schedulesActiveCount: null,
    schedulesLimit: limits.schedulesLimit,
    storageUsedGb: null,
    storageLimitGb: limits.storageGb,
  }
}

export async function getUserDirectory(): Promise<InternalUserRow[]> {
  const [users, me] = await Promise.all([fetchAllUsers(), apiClient.get<User>('/me')])

  return users.map<InternalUserRow>((user) => ({
    id: user.id,
    fullName: user.fullName || user.email.split('@')[0],
    email: user.email,
    organisation: user.organisation ?? '',
    plan: user.plan,
    role: user.role,
    createdAt: user.createdAt,
    isYou: user.id === me.id,
    usage: usageFor(user.plan),
  }))
}

export async function getPlatformStats(): Promise<PlatformStats> {
  // Counts come from the server, which aggregates over every account rather than the
  // page the directory happens to have loaded.
  const [stats, rows] = await Promise.all([
    apiClient.get<{ totalUsers: number; internalUsers: number; planMix: Record<Plan, number> }>('/internal/stats'),
    getUserDirectory(),
  ])

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  let mrr = 0
  for (const plan of Object.keys(stats.planMix) as Plan[]) {
    mrr += PLAN_MONTHLY_IDR[plan] * stats.planMix[plan]
  }

  return {
    totalAccounts: stats.totalUsers,
    internalUsers: stats.internalUsers,
    signupsLast7d: rows.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length,
    byPlan: stats.planMix,
    // No zones, captures or storage tables yet — see the note at the top of this file.
    zonesTotal: null,
    capturesTodayTotal: null,
    storageUsedGbTotal: null,
    mrr,
  }
}

export async function setUserRole(userId: string, role: PlatformRole): Promise<void> {
  await apiClient.patch<User>(`/internal/users/${userId}/role`, { role })
}

export async function setUserPlan(userId: string, plan: Plan): Promise<void> {
  await apiClient.patch<User>(`/internal/users/${userId}/plan`, { plan })
}

/** Formats the MRR estimate the way the plan cards format prices. */
export function formatIdr(amount: number): string {
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}m`
  if (amount >= 1_000) return `Rp ${Math.round(amount / 1_000)}k`
  return `Rp ${amount}`
}

export { PLAN_PRICE }
