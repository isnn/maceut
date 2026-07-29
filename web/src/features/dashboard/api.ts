// TODO: replace with real fetch through @/lib/api-client once api/ exists (GET /usage).

import { PLAN_LIMITS } from '@/lib/constants'
import * as authApi from '@/features/auth/api'
import * as zonesApi from '@/features/zones/api'
import * as capturesApi from '@/features/captures/api'
import type { Plan } from '@/features/auth/types'

export interface UsageSummary {
  plan: Plan
  zonesCount: number
  schedulesActiveCount: number
  capturesToday: number
  capturesLimit: number
  schedulesLimit: number
}

export async function getUsage(): Promise<UsageSummary> {
  const [user, zones, capturesToday] = await Promise.all([
    authApi.getMe(),
    zonesApi.getZones(),
    capturesApi.countTodayCaptures(),
  ])
  const plan = user?.plan ?? 'free'
  return {
    plan,
    zonesCount: zones.length,
    schedulesActiveCount: 0, // schedules feature is Sprint 2
    capturesToday,
    capturesLimit: PLAN_LIMITS[plan].capturesLimit,
    schedulesLimit: PLAN_LIMITS[plan].schedulesLimit,
  }
}
