import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as userRepo from '../repositories/user.repository'
import { publishCaptureJob } from '../lib/rabbitmq-client'
import { NotFoundError, ForbiddenError } from '../errors'
import { PLAN_LIMITS, effectiveRoadClass, type Plan, type RoadClass } from '../types/plan'

/**
 * Captures — the record of what a zone collected, cycle by cycle (F-04, F-07).
 *
 * A "cycle" is one firing: a capture window coming round, or a manual trigger. The
 * pipeline is deliberately split in two. This service decides whether a cycle may
 * happen and writes the row; the worker does the slow part — asking HERE, and later
 * rendering an image — and fills the row in.
 *
 * That split is what keeps the plan limit honest. The limit is checked and the row is
 * written in the same breath, so two windows firing at the same minute cannot both see
 * "9 of 10 used" and both proceed.
 */

export interface PublicCapture {
  id: string
  zoneId: string
  scheduleId: string | null
  status: captureRepo.CaptureStatus
  trigger: captureRepo.CaptureTrigger
  roadClass: RoadClass
  roadsCount: number | null
  /** Mean jam factor across collected roads, 0–10. Null until the cycle completes. */
  jamFactorAvg: number | null
  /** R2 path, null until an image is rendered. Never means "no data". */
  filePath: string | null
  fileSize: number | null
  error: string | null
  /** The instant it was due. Null for manual captures, which are due when asked. */
  scheduledFor: string | null
  /**
   * Seconds between due and collected. Null when there was nothing to be late for.
   *
   * A fact rather than a guess, because both instants are stored — `capturedAt` alone
   * cannot tell an on-time frame from one taken after an outage, and for traffic data
   * that difference is the whole value of the frame.
   */
  lateBySeconds: number | null
  capturedAt: string
}

type AnyCaptureRow = Omit<captureRepo.CaptureRecord, 'traffic'> & { traffic?: unknown }

export function toPublic(row: AnyCaptureRow): PublicCapture {
  return {
    id: row.id,
    zoneId: row.zoneId,
    scheduleId: row.scheduleId,
    status: row.status as captureRepo.CaptureStatus,
    trigger: row.trigger as captureRepo.CaptureTrigger,
    roadClass: row.roadClass as RoadClass,
    roadsCount: row.roadsCount,
    // numeric() comes back as a string from pg; parsing here keeps the API's shape
    // honest rather than leaking "6.40" to a client that expects a number.
    jamFactorAvg: row.jamFactorAvg === null ? null : Number(row.jamFactorAvg),
    filePath: row.filePath,
    fileSize: row.fileSize,
    error: row.error,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    lateBySeconds: row.scheduledFor
      ? Math.round((row.capturedAt.getTime() - row.scheduledFor.getTime()) / 1000)
      : null,
    capturedAt: row.capturedAt.toISOString(),
  }
}

export interface EnqueueResult {
  capture: PublicCapture
  /** False when the plan limit refused it (BR-008) — the row exists, no job was sent. */
  queued: boolean
}

/**
 * Starts one cycle: checks the limit, writes the row, and queues the work.
 *
 * BR-006 caps captures per user per WIB calendar day. BR-008 says a job refused by that
 * cap is dropped rather than retried, and recorded as `skipped_limit` — so the history
 * shows the gap and why, instead of the zone simply going quiet.
 *
 * BR-022 caps the road class at capture time: a zone keeps whatever class it was
 * created with, but a downgraded plan collects less. The effective class is stored on
 * the row so a frame stays explainable later without replaying plan history.
 */
export async function enqueueCapture(
  userId: string,
  zoneId: string,
  opts: {
    trigger: captureRepo.CaptureTrigger
    scheduleId?: string | null
    /** The instant this was due, for scheduled cycles. Drives the lateness figure. */
    scheduledFor?: Date | null
  } = { trigger: 'manual' },
): Promise<EnqueueResult> {
  const zone = await zoneRepo.findById(zoneId)
  if (!zone) throw new NotFoundError('Zone')
  if (zone.userId !== userId) throw new ForbiddenError('Zona ini bukan milik Anda.')

  const account = await userRepo.findByIdWithPlan(userId)
  if (!account) throw new NotFoundError('User')
  const plan: Plan = account.plan

  const roadClass = effectiveRoadClass(zone.roadClass as RoadClass, plan)

  const limit = PLAN_LIMITS[plan].capturesLimit
  const usedToday = await captureRepo.countForWibDay(userId, new Date())

  if (usedToday >= limit) {
    // Recorded, not silently dropped: a zone that stopped collecting is only
    // diagnosable if the reason was written down (BR-008).
    const skipped = await captureRepo.create({
      userId,
      zoneId,
      scheduleId: opts.scheduleId ?? null,
      trigger: opts.trigger,
      roadClass,
      scheduledFor: opts.scheduledFor ?? null,
      status: 'skipped_limit',
      error: `Batas ${limit} capture per hari sudah tercapai.`,
    })
    return { capture: toPublic(skipped), queued: false }
  }

  const capture = await captureRepo.create({
    userId,
    zoneId,
    scheduleId: opts.scheduleId ?? null,
    trigger: opts.trigger,
    roadClass,
    scheduledFor: opts.scheduledFor ?? null,
    status: 'pending',
  })

  try {
    await publishCaptureJob({ captureId: capture.id })
  } catch (err) {
    // The row already exists, so a broker that is down leaves visible evidence rather
    // than a cycle that appears never to have been attempted.
    await captureRepo.markStatus(
      capture.id,
      'failed',
      `Tidak bisa mengantre job: ${err instanceof Error ? err.message : String(err)}`,
    )
    const failed = await captureRepo.findById(capture.id)
    return { capture: toPublic(failed ?? capture), queued: false }
  }

  return { capture: toPublic(capture), queued: true }
}

export interface CaptureListResult {
  captures: PublicCapture[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/** A zone's cycle history, newest first (F-07). */
export async function listForZone(
  userId: string,
  zoneId: string,
  params: { page: number; limit: number },
): Promise<CaptureListResult> {
  const zone = await zoneRepo.findById(zoneId)
  if (!zone) throw new NotFoundError('Zone')
  if (zone.userId !== userId) throw new ForbiddenError('Zona ini bukan milik Anda.')

  const { rows, total } = await captureRepo.listByZone(zoneId, {
    limit: params.limit,
    offset: (params.page - 1) * params.limit,
  })

  return {
    captures: rows.map(toPublic),
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
  }
}

export interface CaptureDetail extends PublicCapture {
  /** The GeoJSON collected for this moment — what the map redraws. */
  traffic: unknown | null
}

/** One cycle, with the traffic it collected. This is what an arrow press loads. */
export async function getCapture(userId: string, captureId: string): Promise<CaptureDetail> {
  const row = await captureRepo.findById(captureId)
  if (!row) throw new NotFoundError('Capture')
  if (row.userId !== userId) throw new ForbiddenError('Capture ini bukan milik Anda.')

  return { ...toPublic(row), traffic: row.traffic ?? null }
}

export interface MissedInput {
  scheduleId: string
  /** The firing that was due when the system was unavailable. */
  scheduledFor: Date
  /** How many firings the outage swallowed, this one included. */
  occurrences: number
  lateBySeconds: number
}

/**
 * Records firings the system was down for, without taking them.
 *
 * Deliberately not fired late. The value of a 07:00 frame is that it is from 07:00 — one
 * collected at 11:40 is a different and misleading answer, and it would spend the
 * account's daily quota on something nobody asked for. Nor is it silently dropped, which
 * is what happened before: the window stayed active, the dashboard kept predicting the
 * next capture, and the zone just had a hole in it.
 *
 * One row per outage per window, not one per swallowed firing. A five-hour gap on a
 * 15-minute window is twenty rows of identical noise; one row saying "20 firings missed"
 * is the same information in a form somebody will actually read.
 *
 * `missed` counts against nothing — not the daily limit (BR-006), because no capture was
 * taken, and not the failure count, because nothing was attempted.
 */
export async function recordMissed(
  userId: string,
  zoneId: string,
  input: MissedInput,
): Promise<PublicCapture> {
  const zone = await zoneRepo.findById(zoneId)
  if (!zone) throw new NotFoundError('Zone')

  const account = await userRepo.findByIdWithPlan(userId)
  const roadClass = effectiveRoadClass(zone.roadClass as RoadClass, account?.plan ?? 'free')

  const minutes = Math.round(input.lateBySeconds / 60)
  const row = await captureRepo.create({
    userId,
    zoneId,
    scheduleId: input.scheduleId,
    trigger: 'scheduled',
    roadClass,
    status: 'missed',
    scheduledFor: input.scheduledFor,
    error:
      input.occurrences > 1
        ? `${input.occurrences} jadwal terlewat — sistem tidak aktif selama ${minutes} menit.`
        : `Jadwal terlewat — sistem tidak aktif selama ${minutes} menit.`,
  })

  return toPublic(row)
}
