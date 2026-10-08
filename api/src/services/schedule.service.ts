import * as captureRepo from '../repositories/capture.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import * as zoneRepo from '../repositories/zone.repository'
import {
  CaptureLimitExceededError,
  ForbiddenError,
  IntervalNotInPlanError,
  NotFoundError,
  ScheduleLimitExceededError,
  ValidationError,
} from '../errors'
import { PLAN_LIMITS, type Plan } from '../types/plan'
import {
  framesPerDay,
  parseTime,
  toCron,
  PLAN_MIN_INTERVAL,
  type CaptureInterval,
  type ScheduleStatus,
} from '../types/schedule'
import type { ScheduleRecord } from '../repositories/schedule.repository'

/**
 * Capture windows (F-05, F-06). Every rule lives here, never in the controller (BR-007).
 */

export interface PublicSchedule {
  id: string
  zoneId: string
  label: string
  /** "HH:mm" in Asia/Jakarta — the field names the Schedule board already uses. */
  start: string
  end: string
  interval: CaptureInterval
  /** 0 = Monday … 6 = Sunday. */
  days: number[]
  active: boolean
  /** Paused by a plan change (ADR-020), not by the user. */
  pausedByPlan: boolean
  /** Frames this window yields on a day it runs — the board's budget figure. */
  framesPerDay: number
  /** Derived, never stored. Shown for transparency and used by the scheduler. */
  cron: string
  /** Frames this window has collected (captures that finished). */
  capturedFrames: number
  /**
   * When the scheduler will next fire it — read from `next_fire_at`, the column the
   * scheduler itself claims by, so this is what WILL happen, not a prediction. Null
   * when paused, or in the moments before a new/edited window is seeded.
   */
  nextFireAt: string | null
  createdAt: string
}

export function toPublic(row: ScheduleRecord, capturedFrames = 0): PublicSchedule {
  const shape = { start: row.startTime, end: row.endTime, interval: row.interval as CaptureInterval, days: row.days }
  return {
    id: row.id,
    zoneId: row.zoneId,
    label: row.label,
    start: row.startTime,
    end: row.endTime,
    interval: row.interval as CaptureInterval,
    days: row.days,
    active: row.status === 'active',
    pausedByPlan: row.pausedByPlan,
    framesPerDay: framesPerDay(shape),
    cron: toCron(shape),
    capturedFrames,
    nextFireAt: row.status === 'active' && row.nextFireAt ? row.nextFireAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function ownedSchedule(userId: string, id: string): Promise<ScheduleRecord> {
  const row = await scheduleRepo.findById(id)
  if (!row || row.status === 'deleted') throw new NotFoundError('Window')
  if (row.userId !== userId) throw new ForbiddenError('You can’t edit this window.')
  return row
}

export interface WindowInput {
  zoneId: string
  label: string
  start: string
  end: string
  interval: CaptureInterval
  days: number[]
}

/**
 * Validates the shape of a window independently of who is asking.
 *
 * Separate from the plan checks below so the "is this a coherent window" question and
 * the "are you allowed this window" question give different errors — a user whose
 * start time is after their end time should not be told to upgrade.
 */
export function validateWindow(input: Pick<WindowInput, 'start' | 'end' | 'interval' | 'days'>): void {
  const start = parseTime(input.start)
  const end = parseTime(input.end)

  if (start === null || end === null) {
    throw new ValidationError('Use a time like 07:30.')
  }
  if (input.interval !== 'daily' && end <= start) {
    throw new ValidationError('Ends before it starts.', { field: 'end' })
  }
  if (input.days.length === 0) {
    throw new ValidationError('Pick at least one day.', { field: 'days' })
  }
  if (input.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new ValidationError('Those days didn’t save.', { field: 'days' })
  }
  if (new Set(input.days).size !== input.days.length) {
    throw new ValidationError('Those days didn’t save.', { field: 'days' })
  }
}

/** BR-002/003 in schedule form: the capture interval is the tier's differentiator. */
function requireIntervalAllowed(plan: Plan, interval: CaptureInterval): void {
  if (!PLAN_MIN_INTERVAL[plan].includes(interval)) {
    throw new IntervalNotInPlanError(interval, plan)
  }
}

/**
 * BR-006 read forwards: a window must not commit the account to more frames per day
 * than the plan allows.
 *
 * Checked at creation rather than only at capture time, because discovering the limit
 * only when frames start being skipped is a much worse experience — the user would see
 * gaps in their data with no explanation of why.
 */
async function requireDailyBudget(
  userId: string,
  plan: Plan,
  candidate: { start: string; end: string; interval: CaptureInterval; days: number[] },
  excludeId?: string,
): Promise<void> {
  const existing = await scheduleRepo.findByUserId(userId)
  const dailyLimit = PLAN_LIMITS[plan].capturesLimit

  // The worst day, not the average: what matters is whether any single day exceeds
  // the allowance. A window running only on Sunday costs nothing on Monday.
  for (let day = 0; day < 7; day++) {
    let frames = 0
    for (const row of existing) {
      if (row.id === excludeId || row.status !== 'active' || !row.days.includes(day)) continue
      frames += framesPerDay({ start: row.startTime, end: row.endTime, interval: row.interval as CaptureInterval, days: row.days })
    }
    if (candidate.days.includes(day)) frames += framesPerDay(candidate)

    if (frames > dailyLimit) {
      throw new CaptureLimitExceededError({ day, frames, dailyLimit, plan })
    }
  }
}

export async function listSchedules(userId: string): Promise<PublicSchedule[]> {
  const [rows, captured] = await Promise.all([scheduleRepo.findByUserId(userId), captureRepo.countDoneBySchedule(userId)])
  return rows.map((row) => toPublic(row, captured.get(row.id) ?? 0))
}

export async function listForZone(userId: string, zoneId: string): Promise<PublicSchedule[]> {
  const zone = await zoneRepo.findById(zoneId)
  if (!zone || zone.userId !== userId) throw new NotFoundError('Zona')
  const [rows, captured] = await Promise.all([scheduleRepo.findByZoneId(zoneId), captureRepo.countDoneBySchedule(userId)])
  return rows.map((row) => toPublic(row, captured.get(row.id) ?? 0))
}

export async function createSchedule(
  userId: string,
  plan: Plan,
  input: WindowInput,
): Promise<PublicSchedule> {
  validateWindow(input)
  requireIntervalAllowed(plan, input.interval)

  // The zone must belong to this user — otherwise a schedule could be attached
  // to someone else's zone and quietly capture it.
  const zone = await zoneRepo.findById(input.zoneId)
  if (!zone || zone.userId !== userId) throw new NotFoundError('Zona')

  // BR-005 — active windows only.
  const limit = PLAN_LIMITS[plan].schedulesLimit
  if ((await scheduleRepo.countActive(userId)) >= limit) {
    throw new ScheduleLimitExceededError(limit)
  }

  await requireDailyBudget(userId, plan, input)

  const created = await scheduleRepo.create({
    userId,
    zoneId: input.zoneId,
    label: input.label.trim(),
    startTime: input.start,
    endTime: input.end,
    interval: input.interval,
    days: input.days,
  })
  return toPublic(created)
}

export interface UpdateScheduleInput {
  label?: string
  start?: string
  end?: string
  interval?: CaptureInterval
  days?: number[]
  active?: boolean
}

/**
 * Edits a window. The zone cannot change (F-06) — a window pointed at a different
 * zone is a different window, and its captured history would stop matching.
 */
export async function updateSchedule(
  userId: string,
  id: string,
  plan: Plan,
  patch: UpdateScheduleInput,
): Promise<PublicSchedule> {
  const existing = await ownedSchedule(userId, id)

  const next = {
    start: patch.start ?? existing.startTime,
    end: patch.end ?? existing.endTime,
    interval: (patch.interval ?? existing.interval) as CaptureInterval,
    days: patch.days ?? existing.days,
  }

  const shapeChanged =
    patch.start !== undefined || patch.end !== undefined || patch.interval !== undefined || patch.days !== undefined

  if (shapeChanged) {
    validateWindow(next)
    if (patch.interval !== undefined) requireIntervalAllowed(plan, next.interval)
  }

  const willBeActive = patch.active ?? existing.status === 'active'

  // Resuming counts against BR-005 again — F-06's edge case: resume beyond the limit
  // must be refused rather than silently allowed.
  if (willBeActive && existing.status !== 'active') {
    const limit = PLAN_LIMITS[plan].schedulesLimit
    if ((await scheduleRepo.countActive(userId, id)) >= limit) {
      throw new ScheduleLimitExceededError(limit)
    }
  }

  if (willBeActive && (shapeChanged || existing.status !== 'active')) {
    await requireDailyBudget(userId, plan, next, id)
  }

  const status: ScheduleStatus | undefined =
    patch.active === undefined ? undefined : patch.active ? 'active' : 'paused'

  const updated = await scheduleRepo.update(id, {
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.start !== undefined ? { startTime: patch.start } : {}),
    ...(patch.end !== undefined ? { endTime: patch.end } : {}),
    ...(patch.interval !== undefined ? { interval: patch.interval } : {}),
    ...(patch.days !== undefined ? { days: patch.days } : {}),
    ...(status ? { status } : {}),
  })
  if (!updated) throw new NotFoundError('Window')
  return toPublic(updated, (await captureRepo.countDoneBySchedule(userId)).get(updated.id) ?? 0)
}

export async function deleteSchedule(userId: string, id: string): Promise<void> {
  await ownedSchedule(userId, id)
  await scheduleRepo.softDelete(id)
}

/** Total frames per day across every active window — the board's budget readout. */
export async function totalFramesPerDay(userId: string): Promise<number> {
  const rows = await scheduleRepo.findByUserId(userId)
  return rows
    .filter((r) => r.status === 'active')
    .reduce(
      (sum, r) =>
        sum + framesPerDay({ start: r.startTime, end: r.endTime, interval: r.interval as CaptureInterval, days: r.days }),
      0,
    )
}
