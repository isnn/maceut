/**
 * What a plan change would pause (ADR-020) — previewed before it happens, from the same
 * server function the change itself runs, so the dialog and the outcome can't disagree.
 */

import { apiClient } from '@/lib/api-client'
import type { Plan } from '@/features/auth/types'

export type ImpactReason = 'interval_above_plan' | 'over_schedule_limit' | 'over_zone_limit' | 'over_daily_frames'

export interface ImpactItem {
  id: string
  name: string
  reason: ImpactReason
}

export interface PlanImpact {
  plan: Plan
  zonesToPause: ImpactItem[]
  schedulesToPause: ImpactItem[]
  /** True when nothing changes — the warning can be skipped. */
  clean: boolean
}

/** The reasons in the app's words (the API's `detail` is Indonesian). */
export const REASON_LABEL: Record<ImpactReason, string> = {
  interval_above_plan: 'its interval isn’t available on this plan',
  over_schedule_limit: 'over the plan’s active-window limit',
  over_zone_limit: 'over the plan’s zone limit',
  over_daily_frames: 'over the plan’s daily snapshot limit',
}

/** The signed-in account's own downgrade. */
export function previewOwnPlanChange(plan: Plan): Promise<PlanImpact> {
  return apiClient.get<PlanImpact>(`/plan/impact?plan=${plan}`)
}

/** Staff previewing a change to another account. */
export function previewAccountPlanChange(userId: string, plan: Plan): Promise<PlanImpact> {
  return apiClient.get<PlanImpact>(`/internal/users/${userId}/plan-impact?plan=${plan}`)
}
