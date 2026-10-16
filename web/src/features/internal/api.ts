/**
 * Platform administration, against the real backend
 * (GET /internal/users, GET /internal/stats, PATCH /internal/users/:id/{plan,role}).
 *
 * The 24 seeded demo tenants are gone. They existed so these screens had something to
 * show before a backend did; now the directory lists the accounts that actually exist,
 * and a quiet screen is the truth rather than a bug.
 *
 * Per-account usage went with them, and has now come back as real numbers: the server
 * counts zones and capture windows per account in two grouped queries. Captures and
 * storage stay `null` because nothing counts them yet (CAP-01), and the UI renders that
 * as "—". Reporting fabricated numbers in an operator tool is worse than reporting
 * none — those are the figures someone acts on when an account complains.
 */

import { PLAN_LIMITS, PLAN_PRICE } from '@/lib/constants'
import { apiClient } from '@/lib/api-client'
import { accessOf, type Access, type Plan, type User } from '@/features/auth/types'
import type { CapturePool } from '@/features/plan/pool'
import type { AccountUsage, InternalUserRow, PlatformStats } from './types'
import type { Zone } from '@/features/zones/types'
import type { Capture } from '@/features/zones/api'
import type { CaptureWindow } from '@/features/schedules/types'

/** Rupiah per month, used for the MRR estimate on the overview. */
const PLAN_MONTHLY_IDR: Record<Plan, number> = { free: 0, starter: 99_000, standard: 349_000, premium: 1_490_000 }

/** Server caps limit at 100 per page; the directory pages through to build the table. */
const PAGE_SIZE = 100
const MAX_PAGES = 50

interface PaginationMeta {
  total: number
  page: number
  limit: number
  total_pages: number
}

/** The `usage` block GET /internal/users now returns alongside each account. */
interface ServerUsage {
  zonesCount: number
  zonesPaused: number
  schedulesActiveCount: number
  schedulesPaused: number
  capturesToday: number | null
  capturesThisMonth?: number
  storageUsedGb: number | null
}

type DirectoryUser = User & { usage?: ServerUsage; roleLockedByConfig?: boolean }

async function fetchAllUsers(): Promise<DirectoryUser[]> {
  const all: DirectoryUser[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, meta } = await apiClient.getWithMeta<DirectoryUser[]>(
      `/internal/users?page=${page}&limit=${PAGE_SIZE}&sort=created_desc`,
    )
    all.push(...data)

    const m = meta as PaginationMeta | undefined
    if (!m || page >= m.total_pages) break
  }
  return all
}

/** Server-measured counts, plus the limits that come from the account's plan. */
function usageFor(plan: Plan, measured: ServerUsage | undefined): AccountUsage {
  const limits = PLAN_LIMITS[plan]
  return {
    zonesCount: measured?.zonesCount ?? 0,
    zonesPaused: measured?.zonesPaused ?? 0,
    zonesLimit: limits.zonesLimit,
    capturesToday: measured?.capturesToday ?? null,
    capturesThisMonth: measured?.capturesThisMonth ?? null,
    monthlyCaptures: limits.monthlyCaptures,
    schedulesActiveCount: measured?.schedulesActiveCount ?? 0,
    schedulesPaused: measured?.schedulesPaused ?? 0,
    schedulesLimit: limits.schedulesLimit,
    storageUsedGb: measured?.storageUsedGb ?? null,
    storageLimitGb: limits.storageGb,
  }
}

/** The user page's account as a directory row, so it can open the same Edit dialog as the list. */
export function rowFromDetail(d: AccountUsageDetail, meId: string | undefined): InternalUserRow {
  const { user, usage } = d
  return {
    id: user.id,
    fullName: user.fullName || user.email.split('@')[0],
    email: user.email,
    plan: user.plan,
    role: user.role,
    access: accessOf(user),
    roleLockedByConfig: user.roleLockedByConfig ?? false,
    emailVerified: user.emailVerified ?? false,
    createdAt: user.createdAt,
    isYou: user.id === meId,
    usage: {
      ...usageFor(user.plan, undefined),
      zonesCount: usage.zonesCount,
      zonesPaused: usage.pausedByPlan.zones,
      schedulesActiveCount: usage.schedulesActiveCount,
      schedulesPaused: usage.pausedByPlan.schedules,
      capturesToday: usage.capturesToday,
      storageUsedGb: usage.storageUsedGb,
    },
  }
}

export async function getUserDirectory(): Promise<InternalUserRow[]> {
  const [users, me] = await Promise.all([fetchAllUsers(), apiClient.get<User>('/me')])

  return users.map<InternalUserRow>((user) => ({
    id: user.id,
    fullName: user.fullName || user.email.split('@')[0],
    email: user.email,
    plan: user.plan,
    role: user.role,
    access: accessOf(user),
    roleLockedByConfig: user.roleLockedByConfig ?? false,
    emailVerified: user.emailVerified ?? false,
    createdAt: user.createdAt,
    isYou: user.id === me.id,
    usage: usageFor(user.plan, user.usage),
  }))
}

export async function getPlatformStats(): Promise<PlatformStats> {
  // Counts come from the server, which aggregates over every account rather than the
  // page the directory happens to have loaded.
  const [stats, rows] = await Promise.all([
    apiClient.get<{
      totalUsers: number
      internalUsers: number
      internalByConfig: number
      planMix: Record<Plan, number>
      zonesCollecting: number
      schedulesActive: number
      capturesToday: number | null
      storageUsedGb: number | null
    }>('/internal/stats'),
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
    internalByConfig: stats.internalByConfig,
    signupsLast7d: rows.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length,
    byPlan: stats.planMix,
    zonesTotal: stats.zonesCollecting,
    schedulesActiveTotal: stats.schedulesActive,
    // Still unmeasured — no captures table (CAP-01).
    capturesTodayTotal: stats.capturesToday,
    storageUsedGbTotal: stats.storageUsedGb,
    mrr,
  }
}

export interface CreateUserInput {
  email: string
  fullName: string
  plan: Plan
  role: Access
  /** Leave out to have the server generate one and return it once. */
  password?: string
}

export interface CreatedUser {
  user: User
  /**
   * Only present when the server generated it. There is one chance to copy it — it is
   * hashed on the way into the database and cannot be read back.
   */
  temporaryPassword?: string
}

/** Staff creating an account for someone (F-21). */
export async function createUser(input: CreateUserInput): Promise<CreatedUser> {
  return apiClient.post<CreatedUser>('/internal/users', input)
}

export interface UpdateUserInput {
  fullName?: string
  email?: string
  plan?: Plan
  role?: Access
  /** Changing this signs the account out everywhere. */
  password?: string
  /** Superadmin only. Unverified, the account can't sign in with its password. */
  emailVerified?: boolean
}

export interface UpdatedUser {
  user: User
  /** Present only when the plan actually moved — what the change paused (ADR-020). */
  impact: { zonesToPause: unknown[]; schedulesToPause: unknown[] } | null
}

/** Staff editing an account (F-22). Send only what changed. */
export async function updateUser(userId: string, input: UpdateUserInput): Promise<UpdatedUser> {
  return apiClient.patch<UpdatedUser>(`/internal/users/${userId}`, input)
}

export interface DeletedUser {
  deleted: { id: string; email: string }
  removed: { zones: number; schedules: number }
}

/**
 * Staff deleting an account (F-22).
 *
 * Irreversible, and it takes the account's zones and capture windows with it. The
 * response reports what went, so the screen can say so rather than leave the operator
 * guessing what they just destroyed.
 */
export async function deleteUser(userId: string): Promise<DeletedUser> {
  return apiClient.delete<DeletedUser>(`/internal/users/${userId}`)
}

export async function setUserRole(userId: string, role: Access): Promise<void> {
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

/** One key of the running server's configuration (GET /internal/config, ADR-018). */
export interface ServerConfigEntry {
  key: string
  /** Null for secrets (never sent) and for keys the environment leaves unset. */
  value: string | null
  set: boolean
  secret: boolean
}

export function getServerConfig(): Promise<ServerConfigEntry[]> {
  return apiClient.get<ServerConfigEntry[]>('/internal/config')
}

/** One account's measured usage, zones and windows — the staff usage page (FE-34). */
export interface AccountUsageDetail {
  user: User
  usage: {
    zonesCount: number
    zonesLimit: number
    schedulesActiveCount: number
    schedulesLimit: number
    framesPerDay: number
    framesPerMonth: number
    pool: CapturePool
    capturesToday: number | null
    exportsThisMonth: number
    storageUsedGb: number
    storageLimitGb: number
    pausedByPlan: { zones: number; schedules: number }
  }
  zones: {
    id: string
    name: string
    status: 'collecting' | 'paused'
    pausedByPlan: boolean
    roadClass: string
    capturesLast7Days: number
    createdAt: string
  }[]
  windows: {
    id: string
    zoneId: string
    zoneName: string
    label: string
    start: string
    end: string
    interval: '15min' | 'hourly' | 'daily'
    days: number[]
    status: 'active' | 'paused'
    pausedByPlan: boolean
  }[]
  /** No payments yet: the plan, since when, and every change that led to it. */
  billing: {
    plan: Plan
    startedAt: string | null
    expiresAt: string | null
    history: PlanChange[]
  }
}

export interface PlanChange {
  id: string
  /** Null when the account was created on `toPlan`. */
  fromPlan: Plan | null
  toPlan: Plan
  source: 'self' | 'staff'
  /** The staff member's name; null for a self-serve change. */
  changedBy: string | null
  createdAt: string
}

export function getAccountUsage(userId: string): Promise<AccountUsageDetail> {
  return apiClient.get<AccountUsageDetail>(`/internal/users/${encodeURIComponent(userId)}/usage`)
}

/** One of an account's zones, read-only for staff: the zone, its windows, its latest captures. */
export interface AccountZoneDetail {
  zone: Zone
  windows: CaptureWindow[]
  captures: { captures: Capture[]; total: number; page: number; limit: number; totalPages: number }
}

export function getAccountZone(userId: string, zoneId: string, page = 1, limit = 20): Promise<AccountZoneDetail> {
  return apiClient.get<AccountZoneDetail>(
    `/internal/users/${encodeURIComponent(userId)}/zones/${encodeURIComponent(zoneId)}?page=${page}&limit=${limit}`,
  )
}
