import { PLAN_LABEL, PLAN_LIMITS } from '@/lib/constants'
import type { Plan } from '@/features/auth/types'
import { DAY_NAME, framesPerDay, type CaptureInterval, type CaptureWindow } from './types'

/**
 * What a capture window may use on each plan — mirrors `PLAN_MIN_INTERVAL` in
 * api/src/types/schedule.ts. The API enforces it (BR-007); the dialog only reads it to
 * explain a limit before the user hits it (FE-30).
 */
export const PLAN_INTERVALS: Record<Plan, CaptureInterval[]> = {
  free: ['daily'],
  standard: ['daily', 'hourly'],
  premium: ['daily', 'hourly', '15min'],
}

/** The cheapest plan that offers an interval. */
export function planFor(interval: CaptureInterval): Plan {
  return (['free', 'standard', 'premium'] as Plan[]).find((p) => PLAN_INTERVALS[p].includes(interval))!
}

/** Why the current choices don't fit the plan — shown in the dialog's upgrade panel. */
export type PlanIssue =
  | { kind: 'interval'; interval: CaptureInterval; needs: Plan }
  | { kind: 'windows'; limit: number }
  | { kind: 'daily'; day: number; frames: number; limit: number }

type Draft = Pick<CaptureWindow, 'start' | 'end' | 'interval' | 'days'>

/** The busiest day if this window were saved: its snapshots plus every other active window's. */
export function busiestDay(windows: CaptureWindow[], draft: Draft, excludeId?: string): { day: number; frames: number } {
  let worst = { day: draft.days[0] ?? 0, frames: 0 }
  for (let day = 0; day < 7; day++) {
    let frames = draft.days.includes(day) ? framesPerDay(draft) : 0
    for (const w of windows) {
      if (w.id !== excludeId && w.active && w.days.includes(day)) frames += framesPerDay(w)
    }
    if (frames > worst.frames) worst = { day, frames }
  }
  return worst
}

/** The first plan problem with the draft, or null when it fits. Same order the API checks. */
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
  if (draft.active && draft.days.length > 0) {
    const worst = busiestDay(windows, draft, excludeId)
    if (worst.frames > limits.capturesLimit) return { kind: 'daily', ...worst, limit: limits.capturesLimit }
  }
  return null
}

/**
 * The latest end time (on a 15-minute step) that keeps the busiest day within the plan,
 * or null if even the shortest window doesn't fit — the "Trim to …" fix.
 */
export function latestFittingEnd(plan: Plan, windows: CaptureWindow[], draft: Draft, excludeId?: string): string | null {
  const [sh = 0, sm = 0] = draft.start.split(':').map(Number)
  const startMin = sh * 60 + sm
  const [eh = 0, em = 0] = draft.end.split(':').map(Number)
  for (let end = eh * 60 + em - 15; end > startMin; end -= 15) {
    const t = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
    if (busiestDay(windows, { ...draft, end: t }, excludeId).frames <= PLAN_LIMITS[plan].capturesLimit) return t
  }
  return null
}

export const dayName = (day: number) => DAY_NAME[day] ?? 'That day'
export const planName = (plan: Plan) => PLAN_LABEL[plan]
