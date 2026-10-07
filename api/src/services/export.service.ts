import { exportErrorForUser } from './user-facing-errors'
import * as exportRepo from '../repositories/export.repository'
import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as r2 from '../lib/r2-client'
import { publishExportJob } from '../lib/rabbitmq-client'
import { config, isR2Configured } from '../config/env'
import {
  ExportBudgetExceededError,
  ExportInProgressError,
  ExportLimitExceededError,
  ForbiddenError,
  NotFoundError,
  UpstreamError,
  ValidationError,
} from '../errors'
import { PLAN_LIMITS, type Plan } from '../types/plan'
import type { CreateExportInput, ExportSpec } from '../schemas/export.schema'
import type { ExportRecord } from '../repositories/export.repository'

/**
 * Studio exports rendered by the worker (FE-21).
 *
 * The request fixes everything the file will contain — the settings and the exact
 * capture ids — and the worker only executes it. The `exports` row is the single
 * source of truth for progress: the worker writes `framesDone`, and every progress bar
 * (the export dialog, Studio's footer chip, the zone page's history) reads it through
 * `toPublic`, which derives the rest — percentage, queue position, time left — at read
 * time, so nothing is stored that could fall out of step with the row.
 */

/** How long a download link stays valid. Short: the page asks again when it polls. */
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60

/** The spec as stored: the request's settings plus the range it resolved to. */
export interface StoredSpec extends ExportSpec {
  range: { from: string; to: string }
  zoneName: string
}

export interface PublicExport {
  id: string
  zoneId: string
  /** As it was named when the export was requested. */
  zoneName: string
  format: exportRepo.ExportFormat
  status: exportRepo.ExportStatus
  frameCount: number
  framesDone: number
  /** 0–1. */
  progress: number
  width: number
  height: number
  range: { from: string; to: string }
  fileSize: number | null
  error: string | null
  /** Exports ahead of this one in the shared queue. Only for `queued`. */
  queuePosition: number | null
  /** Seconds left, from the pace so far. Only while rendering with a frame done. */
  etaSeconds: number | null
  /** A short-lived signed link. Only for `done`. */
  downloadUrl: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  expiresAt: string | null
}

/** An instant in Jakarta time as { date: "YYYY-MM-DD", time: "HHmm" }. */
export function wibParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}${get('minute')}` }
}

/**
 * The download's filename: zone, then the timeframe it covers, in WIB —
 * `YOG-2026-09-23_0600-1900.zip` for one day, `YOG-2026-09-22_1900_to_2026-09-23_0600.webm`
 * across days.
 *
 * WIB because that is the clock printed on every image. The first version cut the date
 * out of the UTC ISO string, so the name disagreed with its own pictures: after 17:00
 * WIB it even carried the previous day's date.
 */
/**
 * One frame's name inside a ZIP — `001-2026-09-28-14-45.png`, numbered from 1, time in
 * WIB. Must match the render page's naming exactly (web/src/app/render/export/page.tsx,
 * `wibStamp`): a reused frame has to sit in the ZIP under the name a drawn one would.
 */
export function frameFileName(index: number, capturedAt: Date, ext: 'png' | 'webp' = 'png'): string {
  const { date, time } = wibParts(capturedAt.toISOString())
  return `${String(index + 1).padStart(3, '0')}-${date}-${time.slice(0, 2)}-${time.slice(2)}.${ext}`
}

export function fileNameFor(row: Pick<ExportRecord, 'format'>, spec: Pick<StoredSpec, 'zoneName' | 'range'>): string {
  const safe = spec.zoneName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'zone'
  const from = wibParts(spec.range.from)
  const to = wibParts(spec.range.to)
  const span = from.date === to.date ? `${from.date}_${from.time}-${to.time}` : `${from.date}_${from.time}_to_${to.date}_${to.time}`
  return `${safe}-${span}.${row.format}`
}

export async function toPublic(row: ExportRecord, now: Date = new Date()): Promise<PublicExport> {
  const spec = row.spec as StoredSpec
  const progress = row.frameCount > 0 ? Math.min(row.framesDone / row.frameCount, 1) : 0

  let etaSeconds: number | null = null
  if (row.status === 'rendering' && row.startedAt && row.framesDone > 0) {
    const perFrame = (now.getTime() - row.startedAt.getTime()) / row.framesDone
    etaSeconds = Math.max(Math.round((perFrame * (row.frameCount - row.framesDone)) / 1000), 0)
  }

  return {
    id: row.id,
    zoneId: row.zoneId,
    zoneName: spec.zoneName,
    format: row.format,
    status: row.status,
    frameCount: row.frameCount,
    framesDone: row.framesDone,
    progress,
    width: spec.width,
    height: spec.height,
    range: spec.range,
    fileSize: row.fileSize,
    // The raw error stays in the row for debugging; users get what it means.
    error: exportErrorForUser(row.error),
    queuePosition: row.status === 'queued' ? await exportRepo.countAhead(row.createdAt) : null,
    etaSeconds,
    downloadUrl:
      row.status === 'done' && row.filePath
        ? await r2.getPresignedUrl(row.filePath, DOWNLOAD_URL_TTL_SECONDS, fileNameFor(row, spec))
        : null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }
}

async function ownedZone(userId: string, zoneId: string) {
  const zone = await zoneRepo.findById(zoneId)
  if (!zone) throw new NotFoundError('Zona')
  if (zone.userId !== userId) throw new ForbiddenError('Zona ini bukan milik Anda.')
  return zone
}

async function ownedExport(userId: string, id: string): Promise<ExportRecord> {
  const row = await exportRepo.findById(id)
  if (!row) throw new NotFoundError('Export')
  if (row.userId !== userId) throw new ForbiddenError('Export ini bukan milik Anda.')
  return row
}

/** An export's rendering work in megapixel-frames — what the plan budget counts (EXP-C). */
export function exportWorkMpFrames(frames: number, width: number, height: number): number {
  return Math.round((frames * width * height) / 1_000_000)
}

/**
 * The plan's two export limits (BR-007, enforced here): a frame count, and a budget of
 * frames × pixels so a long range at poster size can't occupy the worker for hours.
 */
function assertExportFits(plan: Plan, frames: number, width: number, height: number): void {
  const limits = PLAN_LIMITS[plan]
  if (frames > limits.exportFramesLimit) throw new ExportLimitExceededError(limits.exportFramesLimit, frames)
  const requested = exportWorkMpFrames(frames, width, height)
  if (requested > limits.exportBudgetMpFrames) {
    throw new ExportBudgetExceededError({
      budget: limits.exportBudgetMpFrames,
      requested,
      width,
      height,
      maxFrames: Math.floor((limits.exportBudgetMpFrames * 1_000_000) / (width * height)),
    })
  }
}

/** Queues an export (POST /zones/:id/exports). */
export async function createExport(
  userId: string,
  plan: Plan,
  zoneId: string,
  input: CreateExportInput,
): Promise<PublicExport> {
  const zone = await ownedZone(userId, zoneId)

  // Checked before anything is queued: an export that can only fail at the upload,
  // after minutes of rendering, is the worst place to discover missing storage.
  if (!isR2Configured()) throw new UpstreamError('R2', 'penyimpanan file belum dikonfigurasi di server ini.')

  const active = await exportRepo.findActiveForUser(userId)
  if (active) throw new ExportInProgressError(active.id)

  // Lite: only the ids and times are needed here, not 2 × 2 MB of traffic.
  const [a, b] = await Promise.all([
    captureRepo.findLiteById(input.startCaptureId),
    captureRepo.findLiteById(input.endCaptureId),
  ])
  if (!a || !b || a.zoneId !== zoneId || b.zoneId !== zoneId) {
    throw new ValidationError('Rentang export harus berupa capture dari zona ini.')
  }
  const [from, to] = a.capturedAt <= b.capturedAt ? [a.capturedAt, b.capturedAt] : [b.capturedAt, a.capturedAt]

  const frames = await captureRepo.listDoneIdsBetween(zoneId, from, to)
  if (frames.length === 0) throw new ValidationError('Tidak ada capture yang selesai di rentang ini.')
  if (input.format !== 'zip' && frames.length < 2) {
    throw new ValidationError('Animasi butuh minimal 2 frame di rentang yang dipilih.')
  }

  assertExportFits(plan, frames.length, input.spec.width, input.spec.height)

  const spec: StoredSpec = {
    ...input.spec,
    range: { from: frames[0]!.capturedAt.toISOString(), to: frames[frames.length - 1]!.capturedAt.toISOString() },
    zoneName: zone.name,
  }
  const row = await exportRepo.create({
    userId,
    zoneId,
    format: input.format,
    spec,
    frameIds: frames.map((f) => f.id),
  })

  try {
    await publishExportJob({ exportId: row.id })
  } catch (err) {
    // A row nobody will ever render must not sit "queued" forever and block the
    // account's next export — fail it with the reason, then report the outage.
    await exportRepo.fail(row.id, 'Antrian export tidak tersedia. Coba lagi sebentar lagi.')
    throw new UpstreamError('RabbitMQ', err instanceof Error ? err.message : String(err))
  }

  return toPublic(row)
}

/** A zone's exports, newest first (the zone page's Exports section). */
export async function listForZone(userId: string, zoneId: string, limit = 20): Promise<PublicExport[]> {
  await ownedZone(userId, zoneId)
  const rows = await exportRepo.listByZone(zoneId, limit)
  const now = new Date()
  return Promise.all(rows.map((r) => toPublic(r, now)))
}

/** The account's latest exports across every zone — the dashboard's "Recent exports". */
export async function listRecent(userId: string, limit = 5): Promise<PublicExport[]> {
  const rows = await exportRepo.listRecentForUser(userId, limit)
  const now = new Date()
  return Promise.all(rows.map((r) => toPublic(r, now)))
}

/** One export — what the export dialog polls while it renders. */
export async function getExport(userId: string, id: string): Promise<PublicExport> {
  return toPublic(await ownedExport(userId, id))
}

/**
 * DELETE /exports/:id. An export still in progress is cancelled (failed with a reason,
 * so its history says what happened); a finished one is deleted with its file.
 */
export async function removeExport(userId: string, id: string): Promise<{ cancelled: boolean }> {
  const row = await ownedExport(userId, id)

  if (exportRepo.ACTIVE_STATUSES.includes(row.status)) {
    await exportRepo.fail(row.id, 'Dibatalkan.')
    return { cancelled: true }
  }

  if (row.filePath) {
    // The file first: a row deleted with its file left behind is storage nobody can
    // reach to clean up. The reverse just leaves a row to retry the delete from.
    await r2.remove(row.filePath)
  }
  await exportRepo.remove(row.id)
  return { cancelled: false }
}

/**
 * POST /exports/:id/retry — the same settings and the same frozen frames, as a new
 * export. A new row rather than resetting the old one, so the history keeps the failure
 * and why it happened. The same rules as a fresh request apply: one active export per
 * account, and the plan's frame limit and budget (the plan may have changed since).
 */
export async function retryExport(userId: string, plan: Plan, id: string): Promise<PublicExport> {
  const previous = await ownedExport(userId, id)
  if (exportRepo.ACTIVE_STATUSES.includes(previous.status)) throw new ExportInProgressError(previous.id)
  if (!isR2Configured()) throw new UpstreamError('R2', 'penyimpanan file belum dikonfigurasi di server ini.')

  const active = await exportRepo.findActiveForUser(userId)
  if (active) throw new ExportInProgressError(active.id)

  const prevSpec = previous.spec as StoredSpec
  assertExportFits(plan, previous.frameCount, prevSpec.width, prevSpec.height)

  const row = await exportRepo.create({
    userId,
    zoneId: previous.zoneId,
    format: previous.format,
    spec: previous.spec,
    frameIds: previous.frameIds,
  })
  try {
    await publishExportJob({ exportId: row.id })
  } catch (err) {
    await exportRepo.fail(row.id, 'Antrian export tidak tersedia. Coba lagi sebentar lagi.')
    throw new UpstreamError('RabbitMQ', err instanceof Error ? err.message : String(err))
  }
  return toPublic(row)
}

/** Where a finished export's file lives: `exports/{user_id}/{export_id}.{zip|webm}`. */
export function exportPath(row: Pick<ExportRecord, 'id' | 'userId' | 'format'>): string {
  return `exports/${row.userId}/${row.id}.${row.format}`
}

/** When a file finished now should be deleted. */
export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + config.exportRetentionDays * 24 * 60 * 60 * 1000)
}
