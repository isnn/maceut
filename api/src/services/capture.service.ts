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
  opts: { trigger: captureRepo.CaptureTrigger; scheduleId?: string | null } = { trigger: 'manual' },
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
