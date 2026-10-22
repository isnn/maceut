import { PLAN_LABEL, PLAN_LIMITS, PLAN_ORDER } from '@/lib/constants'
import type { Plan } from '@/features/auth/types'
import { DAY_NAME, framesPerMonth, type CaptureInterval, type CaptureWindow } from './types'

/**
 * What a capture window may use on each plan — mirrors `PLAN_MIN_INTERVAL` in
 * api/src/types/schedule.ts. The API enforces it (BR-007); the dialog only reads it to
 * explain a limit before the user hits it (FE-30).
 */
export const PLAN_INTERVALS: Record<Plan, CaptureInterval[]> = {
  free: ['daily'],
  starter: ['daily', 'hourly'],
  standard: ['daily', 'hourly'],
  premium: ['daily', 'hourly', '15min'],
}

/** The cheapest plan that offers an interval. */
export function planFor(interval: CaptureInterval): Plan {
  return PLAN_ORDER.find((p) => PLAN_INTERVALS[p].includes(interval))!
}

/** Why the current choices don't fit the plan — shown in the dialog's upgrade panel. */
export type PlanIssue =
  | { kind: 'interval'; interval: CaptureInterval; needs: Plan }
  | { kind: 'windows'; limit: number }

type Draft = Pick<CaptureWindow, 'start' | 'end' | 'interval' | 'days'>

/**
 * Frames the account's active windows would take in an average month if this draft were
 * saved (F6): the draft replaces the window it edits.
 */
export function projectedMonth(windows: CaptureWindow[], draft: Draft & { active: boolean }, excludeId?: string): number {
  const others = windows.filter((w) => w.active && w.id !== excludeId).reduce((sum, w) => sum + framesPerMonth(w), 0)
  return others + (draft.active ? framesPerMonth(draft) : 0)
}

/** The first plan problem with the draft, or null when it fits. Same order the API checks. Blocks Save. */
export function planIssue(
  plan: Plan,
  windows: CaptureWindow[],
  draft: Draft & { active: boolean },
  excludeId?: string,
): PlanIssue | null {
  if (!PLAN_INTERVALS[plan].includes(draft.interval)) {
    return { kind: 'interval', interval: draft.interval, needs: planFor(draft.interval) }
  }
  const limits = PLAN_LIMITS[plan]
  const otherActive = windows.filter((w) => w.active && w.id !== excludeId).length
  if (draft.active && otherActive + 1 > limits.schedulesLimit) return { kind: 'windows', limit: limits.schedulesLimit }
  // No frame check: the monthly pool is enforced per capture, not per window (F5/F6).
  return null
}

export const dayName = (day: number) => DAY_NAME[day] ?? 'That day'
export const planName = (plan: Plan) => PLAN_LABEL[plan]
