import fs from 'node:fs'
import path from 'node:path'
import type { Channel, ConsumeMessage } from 'amqplib'
import type { Browser } from 'playwright-core'
import { launchBrowser, renderWithPage, type RenderPageJob } from '../lib/render-page'
import { withBrowserSlot } from '../lib/browser-slot'
import { config } from '../config/env'
import * as exportRepo from '../repositories/export.repository'
import * as notificationService from '../services/notification.service'
import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import { slimFor } from '../services/capture.service'
import { exportPath, expiryFrom, frameFileName, type StoredSpec } from '../services/export.service'
import { cachePath, matchesCaptureImage, specHash } from '../services/render-cache.service'
import * as renderCacheRepo from '../repositories/render-cache.repository'
import * as r2 from '../lib/r2-client'
import { MultipartUpload } from '../lib/r2-client'
import { ZipStream } from '../lib/zip-stream'
import { startVideoEncoder, type VideoEncoder, type VideoFormat } from '../lib/video-encoder'

/**
 * Renders Studio exports (FE-21) — a ZIP of frames, or a WebM / MP4 animation — on the
 * server, so a long export no longer depends on the user keeping a tab open.
 *
 * ## Same renderer, by construction
 *
 * Nothing here draws. The worker opens Studio's own render page (`/render/export` on
 * the web app); that page runs the exact `renderCapture` Studio's preview uses, asks
 * the worker for each frame's data (`__exportFrame`), reports progress
 * (`__exportProgress`) and hands back each PNG (`__exportPng`).
 *
 * ## One frame pipeline for every format
 *
 * ZIP and video share `produceFrames`: it decides where each frame comes from and hands
 * frames over strictly in order. Only the destination differs — a streaming ZIP that
 * uploads to R2 as it grows, or ffmpeg writing a video file.
 *
 * - **Reuse first (EXP-A2).** A frame is the capture's own image when the export asks
 *   for exactly that style, or a frame an earlier export already drew (render cache);
 *   the browser draws only what's left, and isn't launched when nothing is.
 * - **Streamed (EXP-A1).** Frames are never collected: memory stays at about one frame.
 * - **Resumed (EXP-A1).** If Chromium dies, a fresh one continues from the next frame
 *   (up to MAX_BROWSER_RESTARTS times).
 * - **Encoded, not recorded (EXP-B).** Video frames go to ffmpeg with the hold time as
 *   the frame rate — no real-time waiting, exact timing (ADR-030).
 * - **One browser per worker.** The export holds the process's only browser slot.
 *
 * ## Progress and cancellation
 *
 * `frames_done` is written at most once a second (and on the last frame) — every
 * progress bar reads it, and each write is the heartbeat the sweeper checks. A
 * cancelled or swept export is never resurrected: `markUploading` and `complete` only
 * move a row that is still where they expect it (issue #58).
 */

interface ExportJob {
  exportId: string
}

const PROGRESS_WRITE_MS = 1000
const HEARTBEAT_MS = 30_000
/** Browser relaunches per export before giving up. Each costs one frame of work. */
export const MAX_BROWSER_RESTARTS = 2
/** Scratch folders older than this, left by a worker that died, are removed at start. */
const STALE_TMP_MS = 60 * 60 * 1000

const CONTENT_TYPE: Record<'zip' | VideoFormat, string> = {
  zip: 'application/zip',
  webm: 'video/webm',
  mp4: 'video/mp4',
}

/** Errors that mean "the browser went away", not "this export can't be rendered". */
export function isBrowserCrash(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /target crashed|page crashed|has been closed|target closed|browser closed|browser has disconnected/i.test(message)
}

// --- Step 0: where the time and memory go ---------------------------------------------

interface Timing {
  frames: number
  /** Frames taken from a capture image or the render cache instead of drawn. */
  reused: number
  dataMs: number
  drawMs: number
  encodeMs: number
  writeMs: number
  restarts: number
}

/** Resident memory of every Chromium process, in MB (Linux /proc; 0 elsewhere). */
function chromiumRssMb(): number {
  let kb = 0
  try {
    for (const pid of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pid)) continue
      try {
        if (!/chrom/i.test(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'))) continue
        kb += Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0)
      } catch {
        // The process ended between listing and reading.
      }
    }
  } catch {
    return 0
  }
  return Math.round(kb / 1024)
}

/** Samples peak memory every 2 s while an export runs. */
function startMemorySampler() {
  const peak = { chromiumMb: 0, workerMb: 0 }
  const sample = () => {
    peak.chromiumMb = Math.max(peak.chromiumMb, chromiumRssMb())
    peak.workerMb = Math.max(peak.workerMb, Math.round(process.memoryUsage().rss / 1048576))
  }
  sample()
  const timer = setInterval(sample, 2000)
  timer.unref()
  return {
    stop: () => {
      clearInterval(timer)
      sample()
      return peak
    },
  }
}

function logSummary(exportId: string, row: { format: string }, spec: StoredSpec, t: Timing, startedAt: number, peak: { chromiumMb: number; workerMb: number }, outcome: string) {
  const drawn = t.frames - t.reused
  const per = (ms: number, n = drawn) => (n > 0 ? Math.round(ms / n) : 0)
  console.log(
    `[export] ${exportId} ${outcome} — ${row.format} ${t.frames} frames ${spec.width}×${spec.height} in ${Math.round((Date.now() - startedAt) / 1000)}s · ` +
      `per drawn frame: data ${per(t.dataMs)}ms, draw ${per(t.drawMs)}ms, encode ${per(t.encodeMs)}ms · write ${per(t.writeMs, t.frames)}ms/frame · ` +
      `peak RSS: chromium ${peak.chromiumMb}MB, worker ${peak.workerMb}MB · reused ${t.reused}/${t.frames} · browser restarts ${t.restarts}`,
  )
}

// --- scratch space for videos ------------------------------------------------------------

/** About how big a video of still frames gets: ≈0.1 byte per pixel per frame, at least 200 KB. */
export function estimateVideoBytes(frames: number, width: number, height: number): number {
  return frames * Math.max(200_000, Math.round(width * height * 0.1))
}

/** Refuses to start a video the scratch disk can't hold, rather than failing halfway. */
async function ensureDiskSpace(dir: string, needBytes: number): Promise<void> {
  try {
    const st = await fs.promises.statfs(dir)
    const free = Number(st.bavail) * Number(st.bsize)
    if (free < needBytes * 1.5) {
      throw new Error(`Ruang disk sementara kurang: perlu ±${Math.round((needBytes * 1.5) / 1048576)} MB, tersedia ${Math.round(free / 1048576)} MB.`)
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Ruang disk')) throw err
    // statfs unavailable: don't block the export on the check itself.
  }
}

/** Removes scratch folders left behind by a worker that died mid-export. */
export async function removeStaleTempDirs(now = Date.now()): Promise<number> {
  let removed = 0
  try {
    for (const name of await fs.promises.readdir(config.exportTmpDir)) {
      const dir = path.join(config.exportTmpDir, name)
      const st = await fs.promises.stat(dir).catch(() => null)
      if (st?.isDirectory() && now - st.mtimeMs > STALE_TMP_MS) {
        await fs.promises.rm(dir, { recursive: true, force: true })
        removed++
      }
    }
  } catch {
    // No scratch folder yet — nothing to clean.
  }
  return removed
}

/** Uploads a file from disk in multipart parts, never holding it whole in memory. */
async function uploadFile(file: string, key: string, contentType: string, onStart: (u: MultipartUpload) => Promise<void>): Promise<number> {
  const upload = await MultipartUpload.start(key, contentType)
  await onStart(upload)
  try {
    for await (const chunk of fs.createReadStream(file, { highWaterMark: 1024 * 1024 })) {
      await upload.write(chunk as Buffer)
    }
    await upload.complete()
    return upload.bytes
  } catch (err) {
    await upload.abort()
    throw err
  }
}

// --- the frame pipeline ------------------------------------------------------------------

type FrameSink = (i: number, name: string, png: Buffer) => Promise<void>

interface FrameContext {
  exportId: string
  userId: string
  spec: StoredSpec
  frameIds: string[]
  zone: { id: string; name: string; ring: [number, number][] }
  timing: Timing
  /** Writes progress; resolves false when the export was cancelled. */
  progress: (done: number) => Promise<boolean>
  isCancelled: () => boolean
  browser: { current: Browser | null }
}

/**
 * Produces every frame of an export, in order, into `sink` — reusing what's already
 * rendered, drawing the rest, and resuming after a browser crash. Returns early (with
 * frames still missing) only when the export was cancelled.
 */
async function produceFrames(ctx: FrameContext, sink: FrameSink): Promise<void> {
  const { exportId, spec, frameIds, timing } = ctx
  // Every frame's capture, without the 2 MB full traffic: drawing needs only the slim
  // version, stored at collection (EXP-A2).
  const captures = new Map((await captureRepo.findLiteByIds(frameIds)).map((c) => [c.id, c]))

  // Where each frame comes from (EXP-A2): the capture's own image when this export asks
  // for exactly its style, a frame an earlier export already drew, or the browser.
  const hash = specHash(spec, ctx.zone)
  const cached = await renderCacheRepo.findMany(hash, frameIds)
  const sources = frameIds.map((id): { kind: 'image' | 'cache' | 'render'; path?: string } => {
    const capture = captures.get(id)
    if (capture?.filePath && matchesCaptureImage(capture.styleUsed, spec)) return { kind: 'image', path: capture.filePath }
    const hit = cached.get(id)
    return hit ? { kind: 'cache', path: hit.path } : { kind: 'render' }
  })

  const frame = async (i: number) => {
    const t = Date.now()
    const capture = captures.get(frameIds[i]!)
    // A capture deleted since the export was queued renders as an empty frame rather
    // than failing the whole file over one missing moment.
    const traffic = capture ? await slimFor(capture) : null
    timing.dataMs += Date.now() - t
    return { capturedAt: (capture?.capturedAt ?? new Date()).toISOString(), traffic }
  }
  const job: RenderPageJob = {
    // The page draws PNG frames for every format; packaging happens here.
    format: 'zip',
    spec,
    frameCount: frameIds.length,
    zoneName: spec.zoneName,
    ring: ctx.zone.ring,
  }

  let written = 0
  const append = async (i: number, name: string, data: Buffer) => {
    const t = Date.now()
    await sink(i, name, data)
    timing.writeMs += Date.now() - t
    written = i + 1
    timing.frames = written
  }

  while (written < frameIds.length && !ctx.isCancelled()) {
    const source = sources[written]!
    if (source.kind !== 'render') {
      // Only the download may fail softly — a missing stored file means "draw this frame".
      // A failure writing it (ZIP upload, ffmpeg) is real and propagates.
      const data = await r2.download(source.path!).catch(() => null)
      if (data) {
        const capture = captures.get(frameIds[written]!)
        await append(written, frameFileName(written, capture?.capturedAt ?? new Date()), data)
        timing.reused++
        await ctx.progress(written)
        continue
      }
      sources[written] = { kind: 'render' }
    }

    // The run of frames that must be drawn, from here to the next reusable one.
    let end = written
    while (end < frameIds.length && sources[end]!.kind === 'render') end++

    if (!ctx.browser.current?.isConnected()) ctx.browser.current = await launchBrowser()
    try {
      await renderWithPage(
        ctx.browser.current,
        { ...job, startFrame: written, endFrame: end },
        {
          frame,
          progress: ctx.progress,
          png: async (i, name, data, stats) => {
            // After a restart the page starts at `written`; anything else repeats a
            // frame already handed over.
            if (i !== written) return
            await append(i, name, data)
            if (stats) {
              timing.drawMs += stats.drawMs
              timing.encodeMs += stats.encodeMs
            }
            // Keep it for a retry or a repeat export of the same style. Never fatal: a
            // frame that isn't cached is simply drawn again next time.
            const captureId = frameIds[i]!
            const key = cachePath(ctx.userId, hash, captureId)
            await r2
              .upload(key, data, 'image/png')
              .then(() => renderCacheRepo.insert({ specHash: hash, captureId, userId: ctx.userId, path: key, size: data.length }))
              .catch((err) => console.warn(`[export] ${exportId} frame ${i + 1} not cached:`, err instanceof Error ? err.message : err))
          },
        },
        `export ${exportId}`,
      )
      if (!ctx.isCancelled() && written < end) throw new Error(`Render berhenti di frame ${written + 1}.`)
    } catch (err) {
      if (ctx.isCancelled()) return
      if (!isBrowserCrash(err) || timing.restarts >= MAX_BROWSER_RESTARTS) throw err
      timing.restarts++
      console.warn(
        `[export] ${exportId} browser crashed at frame ${written + 1}/${frameIds.length} — ` +
          `restarting (${timing.restarts}/${MAX_BROWSER_RESTARTS}) and continuing from there`,
      )
      await ctx.browser.current?.close().catch(() => undefined)
      ctx.browser.current = null
    }
  }
}

// --- the job --------------------------------------------------------------------------

export async function runExport(exportId: string): Promise<void> {
  // The claim is the lock: only a row still `queued` moves to `rendering`. A duplicate
  // delivery, or a job for an export cancelled while it waited, finds nothing to claim.
  const row = await exportRepo.markRendering(exportId)
  if (!row) {
    console.warn(`[export] ${exportId} is no longer queued — skipping`)
    return
  }

  const spec = row.spec as StoredSpec
  const frameIds = row.frameIds
  const timing: Timing = { frames: 0, reused: 0, dataMs: 0, drawMs: 0, encodeMs: 0, writeMs: 0, restarts: 0 }
  const startedAt = Date.now()
  const sampler = startMemorySampler()
  const heartbeat = setInterval(() => void exportRepo.touch(exportId).catch(() => undefined), HEARTBEAT_MS)
  const browser: { current: Browser | null } = { current: null }
  const open: { upload: MultipartUpload | null; encoder: VideoEncoder | null; tmpDir: string | null } = {
    upload: null,
    encoder: null,
    tmpDir: null,
  }
  let outcome = 'failed'

  try {
    const zone = await zoneRepo.findById(row.zoneId)
    if (!zone) throw new Error('Zona sudah dihapus.')

    let cancelled = false
    let lastWrite = 0
    const progress = async (done: number) => {
      const now = Date.now()
      if (done >= frameIds.length || now - lastWrite >= PROGRESS_WRITE_MS) {
        lastWrite = now
        // Lands only while the row is still `rendering` — false means it was cancelled.
        if (!(await exportRepo.reportProgress(exportId, done))) cancelled = true
      }
      return !cancelled
    }
    const ctx: FrameContext = {
      exportId,
      userId: row.userId,
      spec,
      frameIds,
      zone: { id: zone.id, name: zone.name, ring: zone.geometry.coordinates[0] as [number, number][] },
      timing,
      progress,
      isCancelled: () => cancelled,
      browser,
    }
    const key = exportPath(row)
    const format = row.format

    /** The last steps, shared by every format. Guarded so a cancel is never undone (#58). */
    const finishUpload = async (upload: () => Promise<number>): Promise<void> => {
      if (!(await exportRepo.markUploading(exportId))) {
        outcome = 'cancelled'
        return
      }
      const size = await upload()
      if (!(await exportRepo.complete(exportId, key, size, expiryFrom(new Date())))) {
        // Cancelled during the final upload: the file exists but nobody wants it.
        await r2.remove(key).catch(() => undefined)
        outcome = 'cancelled'
        return
      }
      outcome = `done (${size} bytes)`
    }

    await withBrowserSlot(
      async () => {
        if (format === 'zip') {
          const upload = await MultipartUpload.start(key, CONTENT_TYPE.zip)
          open.upload = upload
          await exportRepo.setUploadId(exportId, upload.uploadId)
          const zip = new ZipStream((chunk) => upload.write(chunk))
          await produceFrames(ctx, (_i, name, png) => zip.add(name, png))
          if (cancelled) {
            outcome = 'cancelled'
            return
          }
          await zip.finish()
          await finishUpload(async () => {
            await upload.complete()
            open.upload = null
            return upload.bytes
          })
          return
        }

        // Video: frames → ffmpeg → a file in this export's scratch folder → R2.
        const dir = path.join(config.exportTmpDir, exportId)
        await fs.promises.mkdir(dir, { recursive: true })
        open.tmpDir = dir
        await ensureDiskSpace(dir, estimateVideoBytes(frameIds.length, spec.width, spec.height))
        const file = path.join(dir, `out.${format}`)
        const encoder = startVideoEncoder(format, spec.holdMs, file)
        open.encoder = encoder
        await produceFrames(ctx, (_i, _name, png) => encoder.write(png))
        if (cancelled) {
          outcome = 'cancelled'
          return
        }
        await encoder.finish()
        open.encoder = null
        // The browser's work is done; free it before the upload.
        await browser.current?.close().catch(() => undefined)
        browser.current = null
        await finishUpload(() =>
          uploadFile(file, key, CONTENT_TYPE[format], async (upload) => {
            await exportRepo.setUploadId(exportId, upload.uploadId)
          }),
        )
      },
      { closeIdle: true },
    )

    if (outcome.startsWith('done')) await notificationService.onExportFinished(exportId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[export] ${exportId} failed: ${message}`)
    if (await exportRepo.fail(exportId, message.slice(0, 500))) await notificationService.onExportFinished(exportId)
  } finally {
    clearInterval(heartbeat)
    // Anything still open here is unfinished: discard it rather than leave it billed.
    open.encoder?.kill()
    if (open.upload) {
      await open.upload.abort()
    }
    await exportRepo.setUploadId(exportId, null).catch(() => undefined)
    if (open.tmpDir) await fs.promises.rm(open.tmpDir, { recursive: true, force: true }).catch(() => undefined)
    await browser.current?.close().catch(() => undefined)
    logSummary(exportId, row, spec, timing, startedAt, sampler.stop(), outcome)
  }
}

export async function registerExportConsumer(ch: Channel): Promise<void> {
  const stale = await removeStaleTempDirs()
  if (stale) console.log(`[export] removed ${stale} scratch folder(s) left by a stopped worker`)
  // prefetch applies to consumers started after it, so this leaves the capture
  // consumer's own prefetch untouched.
  await ch.prefetch(1)
  await ch.consume(config.rabbitmqQueueExport, (msg: ConsumeMessage | null) => {
    if (!msg) return
    void (async () => {
      try {
        const job = JSON.parse(msg.content.toString()) as ExportJob
        if (!job?.exportId) throw new Error('job tanpa exportId')
        await runExport(job.exportId)
      } catch (err) {
        console.error('[export] bad job:', err instanceof Error ? err.message : err)
        ch.nack(msg, false, false)
        return
      }
      // Acked once the outcome is on the row, success or failure. A failed export is
      // retried by the user, from the history, not by redelivery.
      ch.ack(msg)
    })()
  })
  console.log(`[worker] consuming ${config.rabbitmqQueueExport} (prefetch 1, streamed, ffmpeg video, one browser per worker)`)
}
