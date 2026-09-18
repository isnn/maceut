// TODO: replace with real fetch through @/lib/api-client once api/ exists
// (GET /internal/users, GET /internal/stats, PATCH /internal/users/:id).
//
// Seeds demo tenants into the same maceut_mock_users table real accounts live
// in, so the directory and auth can never disagree. Only the signed-in row
// carries live usage — seeded rows have no real zones or captures to count, so
// their figures are a fixed snapshot generated once and labelled as demo data.

import { PLAN_LIMITS, PLAN_PRICE } from '@/lib/constants'
import * as authApi from '@/features/auth/api'
import * as dashboardApi from '@/features/dashboard/api'
import type { Plan, PlatformRole } from '@/features/auth/types'
import type { AccountUsage, InternalUserRow, PlatformStats } from './types'

const SEEDED_KEY = 'maceut_mock_internal_seeded'
const USAGE_KEY = 'maceut_mock_internal_usage'

/** Rupiah per month, used for the MRR estimate on the overview. */
const PLAN_MONTHLY_IDR: Record<Plan, number> = { free: 0, standard: 490_000, premium: 1_900_000 }

const DEMO_TENANTS: { fullName: string; organisation: string; email: string; plan: Plan; daysAgo: number }[] = [
  { fullName: 'Dewi Anggraini', organisation: 'Pemda Jakarta Selatan', email: 'dewi@jakselpemda.go.id', plan: 'premium', daysAgo: 141 },
  { fullName: 'Bagus Setiawan', organisation: 'Dinas Bina Marga Jabar', email: 'bagus@binamarga.go.id', plan: 'standard', daysAgo: 133 },
  { fullName: 'Sri Handayani', organisation: 'Dishub Kota Bandung', email: 'sri@dishubbandung.go.id', plan: 'standard', daysAgo: 128 },
  { fullName: 'Andi Kurniawan', organisation: 'Logistik Nusantara', email: 'andi@logistiknusantara.co.id', plan: 'free', daysAgo: 119 },
  { fullName: 'Maya Puspita', organisation: 'Konsultan Transportasi Maju', email: 'maya@konsultanmaju.id', plan: 'free', daysAgo: 112 },
  { fullName: 'Rudi Hartono', organisation: 'Dishub Provinsi Banten', email: 'rudi@dishubbanten.go.id', plan: 'premium', daysAgo: 104 },
  { fullName: 'Lestari Wulandari', organisation: 'Pemkot Surabaya', email: 'lestari@surabaya.go.id', plan: 'standard', daysAgo: 97 },
  { fullName: 'Fajar Ramadhan', organisation: 'Ekspedisi Cepat Jaya', email: 'fajar@cepatjaya.co.id', plan: 'free', daysAgo: 91 },
  { fullName: 'Nurul Aini', organisation: 'Bappeda Kota Semarang', email: 'nurul@semarangkota.go.id', plan: 'standard', daysAgo: 84 },
  { fullName: 'Yoga Pratama', organisation: 'Fleet Andalan Logistik', email: 'yoga@andalanfleet.co.id', plan: 'free', daysAgo: 78 },
  { fullName: 'Rina Kusuma', organisation: 'Dinas PU Kota Medan', email: 'rina@pumedan.go.id', plan: 'free', daysAgo: 71 },
  { fullName: 'Hendra Wijaya', organisation: 'Pemda Kabupaten Bekasi', email: 'hendra@bekasikab.go.id', plan: 'standard', daysAgo: 66 },
  { fullName: 'Siti Nurhaliza', organisation: 'Dishub Kota Palembang', email: 'siti@palembang.go.id', plan: 'free', daysAgo: 59 },
  { fullName: 'Agus Salim', organisation: 'Trans Sumatra Kargo', email: 'agus@transsumatra.co.id', plan: 'premium', daysAgo: 52 },
  { fullName: 'Putri Amelia', organisation: 'Bappeda Jawa Tengah', email: 'putri@jatengprov.go.id', plan: 'standard', daysAgo: 47 },
  { fullName: 'Dimas Prasetyo', organisation: 'Pemkot Yogyakarta', email: 'dimas@jogjakota.go.id', plan: 'free', daysAgo: 41 },
  { fullName: 'Kartika Sari', organisation: 'Dinas Perhubungan Bali', email: 'kartika@dishubbali.go.id', plan: 'standard', daysAgo: 35 },
  { fullName: 'Bayu Nugroho', organisation: 'Armada Timur Logistik', email: 'bayu@armadatimur.co.id', plan: 'free', daysAgo: 28 },
  { fullName: 'Indah Permata', organisation: 'Pemkot Makassar', email: 'indah@makassar.go.id', plan: 'free', daysAgo: 21 },
  { fullName: 'Reza Firmansyah', organisation: 'Dishub Kota Malang', email: 'reza@malangkota.go.id', plan: 'free', daysAgo: 14 },
  { fullName: 'Anisa Rahmawati', organisation: 'Riset Mobilitas Kota', email: 'anisa@risetmobilitas.id', plan: 'standard', daysAgo: 9 },
  { fullName: 'Galih Saputra', organisation: 'Pemda Kabupaten Sleman', email: 'galih@slemankab.go.id', plan: 'free', daysAgo: 5 },
  { fullName: 'Wulan Safitri', organisation: 'Kargo Andalan Jaya', email: 'wulan@kargoandalan.co.id', plan: 'free', daysAgo: 3 },
  { fullName: 'Teguh Santoso', organisation: 'Dishub Kota Balikpapan', email: 'teguh@balikpapan.go.id', plan: 'premium', daysAgo: 1 },
]

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

/**
 * Deterministic pseudo-usage from the account id, so the same tenant always
 * reports the same figures instead of reshuffling on every render.
 */
function hashOf(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 100_000
  return h
}

function snapshotFor(seed: string, plan: Plan): AccountUsage {
  const limits = PLAN_LIMITS[plan]
  const h = hashOf(seed)
  const ratio = (offset: number) => ((h + offset * 37) % 85) / 100
  return {
    zonesCount: Math.max(1, Math.round(limits.zonesLimit * ratio(1))),
    zonesLimit: limits.zonesLimit,
    capturesToday: Math.round(limits.capturesLimit * ratio(2)),
    capturesLimit: limits.capturesLimit,
    schedulesActiveCount: Math.round(limits.schedulesLimit * ratio(3)),
    schedulesLimit: limits.schedulesLimit,
    storageUsedGb: Number((limits.storageGb * ratio(4)).toFixed(1)),
    storageLimitGb: limits.storageGb,
  }
}

function readUsageTable(): Record<string, AccountUsage> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(USAGE_KEY)
  return raw ? (JSON.parse(raw) as Record<string, AccountUsage>) : {}
}

async function seedIfNeeded() {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(SEEDED_KEY)) return
  window.localStorage.setItem(SEEDED_KEY, '1')

  // listUsers() first, so the backfill promotes a real account to `internal`
  // before any demo tenant exists to be picked.
  await authApi.listUsers()
  await authApi.seedUsers(
    DEMO_TENANTS.map((t) => ({
      fullName: t.fullName,
      organisation: t.organisation,
      email: t.email,
      plan: t.plan,
      createdAt: daysAgoIso(t.daysAgo),
    }))
  )

  const demoEmails = new Set(DEMO_TENANTS.map((t) => t.email.toLowerCase()))
  const usage: Record<string, AccountUsage> = {}
  for (const user of await authApi.listUsers()) {
    if (demoEmails.has(user.email.toLowerCase())) usage[user.id] = snapshotFor(user.id, user.plan)
  }
  window.localStorage.setItem(USAGE_KEY, JSON.stringify(usage))
}

export function isDemoEmail(email: string): boolean {
  return DEMO_TENANTS.some((t) => t.email.toLowerCase() === email.toLowerCase())
}

export async function getUserDirectory(): Promise<InternalUserRow[]> {
  await seedIfNeeded()
  const [users, me, liveUsage] = await Promise.all([
    authApi.listUsers(),
    authApi.getMe(),
    dashboardApi.getUsage(),
  ])
  const snapshots = readUsageTable()

  const rows = users.map<InternalUserRow>((user) => {
    const isYou = user.id === me?.id
    const limits = PLAN_LIMITS[user.plan]
    const usage: AccountUsage = isYou
      ? {
          zonesCount: liveUsage.zonesCount,
          zonesLimit: liveUsage.zonesLimit,
          capturesToday: liveUsage.capturesToday,
          capturesLimit: liveUsage.capturesLimit,
          schedulesActiveCount: liveUsage.schedulesActiveCount,
          schedulesLimit: liveUsage.schedulesLimit,
          storageUsedGb: liveUsage.storageUsedGb,
          storageLimitGb: liveUsage.storageLimitGb,
        }
      : (snapshots[user.id] ?? {
          zonesCount: 0,
          zonesLimit: limits.zonesLimit,
          capturesToday: 0,
          capturesLimit: limits.capturesLimit,
          schedulesActiveCount: 0,
          schedulesLimit: limits.schedulesLimit,
          storageUsedGb: 0,
          storageLimitGb: limits.storageGb,
        })

    return {
      id: user.id,
      fullName: user.fullName || user.email.split('@')[0],
      email: user.email,
      organisation: user.organisation,
      plan: user.plan,
      role: user.role,
      createdAt: user.createdAt,
      isYou,
      isDemo: isDemoEmail(user.email),
      usage,
    }
  })

  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const rows = await getUserDirectory()
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

  const byPlan: Record<Plan, number> = { free: 0, standard: 0, premium: 0 }
  let zonesTotal = 0
  let capturesTodayTotal = 0
  let storageUsedGbTotal = 0
  let mrr = 0

  for (const row of rows) {
    byPlan[row.plan] += 1
    zonesTotal += row.usage.zonesCount
    capturesTodayTotal += row.usage.capturesToday
    storageUsedGbTotal += row.usage.storageUsedGb
    mrr += PLAN_MONTHLY_IDR[row.plan]
  }

  return {
    totalAccounts: rows.length,
    internalUsers: rows.filter((r) => r.role === 'internal').length,
    signupsLast7d: rows.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length,
    byPlan,
    zonesTotal,
    capturesTodayTotal,
    storageUsedGbTotal: Number(storageUsedGbTotal.toFixed(1)),
    mrr,
  }
}

export async function setUserRole(userId: string, role: PlatformRole): Promise<void> {
  await authApi.setUserRole(userId, role)
}

export async function setUserPlan(userId: string, plan: Plan): Promise<void> {
  await authApi.setUserPlan(userId, plan)
}

/** Formats the MRR estimate the way the plan cards format prices. */
export function formatIdr(amount: number): string {
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}m`
  if (amount >= 1_000) return `Rp ${Math.round(amount / 1_000)}k`
  return `Rp ${amount}`
}

export { PLAN_PRICE }
