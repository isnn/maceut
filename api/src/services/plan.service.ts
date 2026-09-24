import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import { PLAN_LIMITS, type Plan } from '../types/plan'
import { PLAN_MIN_INTERVAL, framesPerDay, type CaptureInterval } from '../types/schedule'

/**
 * What happens to an account's data when its plan changes (ADR-020).
 *
 * The rule is **grandfather and block**: nothing is ever deleted, anything over the
 * new limit is paused, and creating more is refused until the account is back within
 * its allowance.
 *
 * The alternative — deleting what no longer fits — risks destroying the only record
 * of a road closure someone downgraded past. The other alternative, doing nothing,
 * is what the code did until now: an account could buy premium for one month, build
 * everything, drop to free and keep premium capability forever.
 *
 * This extends a precedent rather than inventing one. BR-022 already grandfathers
 * road class: a zone keeps the class it was created with after a downgrade, and only
 * the capture is capped. Road class therefore needs no pausing here.
 */

export type ImpactReason =
  | 'interval_above_plan'
  | 'over_schedule_limit'
  | 'over_zone_limit'
  | 'over_daily_frames'

export interface ImpactItem {
  id: string
  name: string
  reason: ImpactReason
  /** Human sentence for the confirmation dialog. */
  detail: string
}

export interface PlanImpact {
  plan: Plan
  zonesToPause: ImpactItem[]
  schedulesToPause: ImpactItem[]
  /** True when nothing changes — the dialog can then skip the warning entirely. */
  clean: boolean
}

const REASON_DETAIL: Record<ImpactReason, string> = {
  interval_above_plan: 'Interval-nya tidak tersedia di paket baru',
  over_schedule_limit: 'Melebihi batas jendela aktif paket baru',
  over_zone_limit: 'Melebihi batas zona paket baru',
  over_daily_frames: 'Melebihi anggaran frame per hari paket baru',
}

function item(id: string, name: string, reason: ImpactReason): ImpactItem {
  return { id, name, reason, detail: REASON_DETAIL[reason] }
}

/**
 * Works out exactly what a move to `plan` would pause, without changing anything.
 *
 * `applyPlanChange` runs the same function, so the confirmation a user is shown and
 * the outcome they get cannot disagree — the usual way that kind of dialog goes wrong
 * is two implementations drifting apart.
 *
 * Order matters. Interval violations are resolved first because they are absolute:
 * an hourly window simply cannot run on a free plan, whatever else is going on.
 * Pausing those may already bring the counts and the frame budget back under, which
 * means fewer things get paused overall than a naive pass would produce.
 */
export async function previewPlanChange(userId: string, plan: Plan): Promise<PlanImpact> {
  const limits = PLAN_LIMITS[plan]
  const allowedIntervals = PLAN_MIN_INTERVAL[plan]

  const schedules = await scheduleRepo.findByUserId(userId)
  const active = schedules.filter((s) => s.status === 'active')

  const schedulesToPause: ImpactItem[] = []
  const pausedIds = new Set<string>()

  const pause = (s: (typeof schedules)[number], reason: ImpactReason) => {
    if (pausedIds.has(s.id)) return
    pausedIds.add(s.id)
    schedulesToPause.push(item(s.id, s.label, reason))
  }

  // 1. Intervals the new plan cannot run at all.
  for (const s of active) {
    if (!allowedIntervals.includes(s.interval as CaptureInterval)) pause(s, 'interval_above_plan')
  }

  // 2. Too many active windows (BR-005). Newest first — an older window is likelier
  //    to be the one the account actually depends on.
  const stillActive = () => active.filter((s) => !pausedIds.has(s.id))
  const byNewest = [...active].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  for (const s of byNewest) {
    if (stillActive().length <= limits.schedulesLimit) break
    pause(s, 'over_schedule_limit')
  }

  // 3. Daily frame budget (BR-006), judged on the worst day rather than the average —
  //    a window that only runs on Sunday costs nothing on Monday.
  const worstDayFrames = (rows: typeof schedules) => {
    let worst = 0
    for (let day = 0; day < 7; day++) {
      let frames = 0
      for (const s of rows) {
        if (!s.days.includes(day)) continue
        frames += framesPerDay({
          start: s.startTime,
          end: s.endTime,
          interval: s.interval as CaptureInterval,
          days: s.days,
        })
      }
      if (frames > worst) worst = frames
    }
    return worst
  }

  for (const s of byNewest) {
    if (worstDayFrames(stillActive()) <= limits.capturesLimit) break
    pause(s, 'over_daily_frames')
  }

  // 4. Too many collecting zones. Same newest-first rule.
  const zones = await zoneRepo.findByUserId(userId)
  const collecting = zones
    .filter((z) => z.status === 'collecting')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const zonesToPause: ImpactItem[] = collecting
    .slice(0, Math.max(collecting.length - limits.zonesLimit, 0))
    .map((z) => item(z.id, z.name, 'over_zone_limit'))

  return {
    plan,
    zonesToPause,
    schedulesToPause,
    clean: zonesToPause.length === 0 && schedulesToPause.length === 0,
  }
}

/**
 * Applies the pauses the preview describes.
 *
 * Deliberately does NOT write the plan itself — the caller does that, so the plan
 * write and these pauses can sit in one transaction. Splitting them without a
 * transaction would leave a premium-shaped account on a free plan if this half fails.
 *
 * Upgrades produce an empty impact and therefore change nothing: paused items stay
 * paused. Resuming is the user's decision, because silently restarting captures they
 * had stopped would spend their daily quota without asking.
 */
export async function applyPlanChange(userId: string, plan: Plan): Promise<PlanImpact> {
  const impact = await previewPlanChange(userId, plan)

  for (const s of impact.schedulesToPause) {
    await scheduleRepo.update(s.id, { status: 'paused' })
  }
  for (const z of impact.zonesToPause) {
    await zoneRepo.update(z.id, { status: 'paused' })
  }

  return impact
}
