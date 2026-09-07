// TODO: replace with real fetch through @/lib/api-client once api/ exists (GET /usage).

import { PLAN_LIMITS } from '@/lib/constants'
import * as authApi from '@/features/auth/api'
import * as zonesApi from '@/features/zones/api'
import * as capturesApi from '@/features/captures/api'
import * as schedulesApi from '@/features/schedules/api'
import { totalFramesPerDay } from '@/features/schedules/api'
import type { Plan } from '@/features/auth/types'

export interface UsageSummary {
  plan: Plan
  zonesCount: number
  zonesLimit: number
  schedulesActiveCount: number
  schedulesLimit: number
  capturesToday: number
  capturesLimit: number
  framesPerDay: number
  rendersThisMonth: number
  storageUsedGb: number
  storageLimitGb: number
  seatsUsed: number
  seatsLimit: number
}

/** The "Kesehatan koleksi" panel on the dashboard (3g). */
export interface CollectionHealth {
  status: 'healthy' | 'degraded'
  nextCaptureAt: string
  nextCaptureIn: string
  roadsReporting: number
  roadsTotal: number
  missedCaptures: string
  peakIndex: number
  peakAt: string
}

export async function getUsage(): Promise<UsageSummary> {
  const user = await authApi.getMe()
  const plan = user?.plan ?? 'free'
  const limits = PLAN_LIMITS[plan]

  const [zones, capturesToday, windows] = await Promise.all([
    zonesApi.getZones(plan),
    capturesApi.countTodayCaptures(),
    schedulesApi.getWindows(plan),
  ])

  const activeWindows = windows.filter((w) => w.active)
  return {
    plan,
    zonesCount: zones.length,
    zonesLimit: limits.zonesLimit,
    schedulesActiveCount: activeWindows.length,
    schedulesLimit: limits.schedulesLimit,
    capturesToday,
    capturesLimit: limits.capturesLimit,
    framesPerDay: totalFramesPerDay(windows),
    rendersThisMonth: 7,
    storageUsedGb: Number((zones.length * 1.37).toFixed(1)),
    storageLimitGb: limits.storageGb,
    seatsUsed: plan === 'free' ? 1 : 3,
    seatsLimit: limits.seatsLimit,
  }
}

export async function getCollectionHealth(): Promise<CollectionHealth> {
  return {
    status: 'healthy',
    nextCaptureAt: '10:00',
    nextCaptureIn: 'dalam 21 menit · 2 zona',
    roadsReporting: 126,
    roadsTotal: 128,
    missedCaptures: '1 · kemarin 14:00',
    peakIndex: 81,
    peakAt: '07:40',
  }
}
