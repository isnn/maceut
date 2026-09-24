import * as scheduleRepo from '../repositories/schedule.repository'
import * as zoneRepo from '../repositories/zone.repository'
import { NotFoundError, ForbiddenError, ScheduleLimitExceededError, ValidationError } from '../errors'
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
  /** Frames this window yields on a day it runs — the board's budget figure. */
  framesPerDay: number
  /** Derived, never stored. Shown for transparency and used by the scheduler. */
  cron: string
  /** Frames already collected. Zero until captures exist. */
  capturedFrames: number
  createdAt: string
}

export function toPublic(row: ScheduleRecord): PublicSchedule {
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
    framesPerDay: framesPerDay(shape),
    cron: toCron(shape),
    // Real counts arrive with the captures table; zero is honest here because a
    // window that has produced nothing has produced nothing.
    capturedFrames: 0,
    createdAt: row.createdAt.toISOString(),
  }
}

async function ownedSchedule(userId: string, id: string): Promise<ScheduleRecord> {
  const row = await scheduleRepo.findById(id)
  if (!row || row.status === 'deleted') throw new NotFoundError('Jadwal')
  if (row.userId !== userId) throw new ForbiddenError('Jadwal ini bukan milik Anda.')
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
    throw new ValidationError('Jam harus dalam format HH:mm (24 jam).')
  }
  if (input.interval !== 'daily' && end <= start) {
    throw new ValidationError('Jam selesai harus setelah jam mulai.')
  }
  if (input.days.length === 0) {
    throw new ValidationError('Pilih minimal satu hari.')
  }
  if (input.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new ValidationError('Hari harus berupa angka 0 (Senin) sampai 6 (Minggu).')
  }
  if (new Set(input.days).size !== input.days.length) {
    throw new ValidationError('Ada hari yang terpilih lebih dari sekali.')
  }
}

/** BR-002/003 in schedule form: the capture interval is the tier's differentiator. */
function requireIntervalAllowed(plan: Plan, interval: CaptureInterval): void {
  if (!PLAN_MIN_INTERVAL[plan].includes(interval)) {
    throw new ForbiddenError(`Interval ini tidak tersedia di paket ${plan}. Naikkan paket untuk memakainya.`)
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
      throw new ValidationError(
        `Jendela ini membuat total ${frames} frame/hari, melebihi batas ${dailyLimit} frame/hari paket Anda.`,
        { frames, dailyLimit, plan },
      )
    }
  }
}

export async function listSchedules(userId: string): Promise<PublicSchedule[]> {
  return (await scheduleRepo.findByUserId(userId)).map(toPublic)
}

export async function listForZone(userId: string, zoneId: string): Promise<PublicSchedule[]> {
  const zone = await zoneRepo.findById(zoneId)
  if (!zone || zone.userId !== userId) throw new NotFoundError('Zona')
  return (await scheduleRepo.findByZoneId(zoneId)).map(toPublic)
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
  if (!updated) throw new NotFoundError('Jadwal')
  return toPublic(updated)
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
