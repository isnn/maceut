/**
 * Dashboard summary, against the real backend (GET /usage).
 *
 * Every figure is measured or `null`; nothing is estimated. A dashboard is read at a
 * glance and believed, so a plausible-looking invented number is worse than a dash —
 * nobody thinks to check it. The previous version reported `rendersThisMonth: 7`,
 * storage as `zones.length * 1.37`, and seats as `plan === 'free' ? 1 : 3`, none of
 * which measured anything.
 *
 * `null` currently means the captures table does not exist yet (CAP-01), or HERE is
 * not answering. Each becomes a real number when its feature lands, with no change
 * here.
 */

import { apiClient } from '@/lib/api-client'
import type { Plan } from '@/features/auth/types'

export interface CollectionHealth {
  status: 'healthy' | 'degraded' | 'idle'
  /** "HH:mm" WIB, derived from the active windows. Null when nothing is scheduled. */
  nextCaptureAt: string | null
  /** Whole days until that firing on Jakarta's calendar; 0 = today. */
  nextCaptureInDays: number | null
  zonesCollecting: number
  roadsReporting: number | null
  missedCaptures: number | null
  peakIndex: number | null
  peakAt: string | null
}

export interface UsageSummary {
  plan: Plan

  zonesCount: number
  zonesLimit: number
  schedulesActiveCount: number
  schedulesLimit: number

  /** Frames the active windows produce on their busiest day. */
  framesPerDay: number
  capturesLimit: number

  capturesToday: number | null
  rendersThisMonth: number | null
  storageUsedGb: number | null
  storageLimitGb: number

  /**
   * Zones and windows paused for exceeding the plan (ADR-020).
   *
   * Surfacing this is the whole point: without it, a downgraded account just sees
   * collection stop with nothing anywhere explaining why.
   */
  pausedByPlan: { zones: number; schedules: number }

  health: CollectionHealth
}

export async function getUsage(): Promise<UsageSummary> {
  return apiClient.get<UsageSummary>('/usage')
}

/**
 * Kept separate for screens that only want health. It comes from the same response,
 * so this is one request, not two.
 */
export async function getCollectionHealth(): Promise<CollectionHealth> {
  return (await getUsage()).health
}
