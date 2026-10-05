import fs from 'node:fs'
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

/**
 * Renders Studio exports (FE-21) — a ZIP of frames or a WebM animation — in headless
 * Chromium, so a long export no longer depends on the user keeping a tab open.
 *
 * ## Same renderer, by construction
 *
 * Nothing here draws. The worker opens Studio's own render page (`/render/export` on
 * the web app) and hands it the job; that page runs the exact `renderCapture` and
 * `recordAnimation` Studio's preview uses. The page asks the worker for each frame
 * (`__exportFrame`), reports progress (`__exportProgress`), and hands back its output
 * (`__exportPng` / `__exportChunk`) — Playwright's exposeFunction, in-process.
 *
 * ## Built for a small host (EXP-A1)
 *
 * This host has no swap and about 0.5–1 GB free; long exports used to die with
 * "Target crashed". Three things keep an export inside that:
 *
 * - **Streamed, not held.** Each ZIP frame goes straight into a streaming ZIP writer
 *   whose bytes upload to R2 in 16 MiB parts as they're produced. Memory is about one
 *   frame plus one part, whatever the frame count; ZIP64 past 4 GB (issue #63).
 * - **Resumed, not restarted.** Frames are independent. If Chromium dies mid-export,
 *   a fresh browser picks up at the next frame (up to MAX_BROWSER_RESTARTS times) —
 *   a crash costs one frame, not the export.
 * - **One browser per worker.** The export holds the process's only browser slot; the
 *   capture-image consumer waits (issue #67).
 *
 * ## Progress and cancellation
 *
 * The page reports every frame; the worker writes `frames_done` at most once a second
 * (and on the last frame) — every progress bar reads it, and each write is also the
 * heartbeat the sweeper checks. A cancelled or swept export is never resurrected:
 * `markUploading` and `complete` only move a row that is still where they expect it
 * (issue #58), and the upload is aborted instead.
 */

interface ExportJob {
  exportId: string
}

const PROGRESS_WRITE_MS = 1000
const HEARTBEAT_MS = 30_000
/** Browser relaunches per export before giving up. Each costs one frame of work. */
export const MAX_BROWSER_RESTARTS = 2

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
  const per = (ms: number) => (t.frames ? Math.round(ms / t.frames) : 0)
  console.log(
    `[export] ${exportId} ${outcome} — ${row.format} ${t.frames} frames ${spec.width}×${spec.height} in ${Math.round((Date.now() - startedAt) / 1000)}s · ` +
      `per frame: data ${per(t.dataMs)}ms, draw ${per(t.drawMs)}ms, encode ${per(t.encodeMs)}ms, write ${per(t.writeMs)}ms · ` +
      `peak RSS: chromium ${peak.chromiumMb}MB, worker ${peak.workerMb}MB · reused ${t.reused}/${t.frames} · browser restarts ${t.restarts}`,
  )
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
  let browser: Browser | null = null
  let upload: MultipartUpload | null = null
  let outcome = 'failed'

  try {
    const zone = await zoneRepo.findById(row.zoneId)
    if (!zone) throw new Error('Zona sudah dihapus.')

    let cancelled = false
    let lastWrite = 0
    const job: RenderPageJob = {
      format: row.format,
      spec,
      frameCount: frameIds.length,
      zoneName: spec.zoneName,
      ring: zone.geometry.coordinates[0] as [number, number][],
    }
    // Every frame's capture, without the 2 MB full traffic: drawing needs only the slim
    // version, stored at collection (EXP-A2).
    const captures = new Map((await captureRepo.findLiteByIds(frameIds)).map((c) => [c.id, c]))
    const frame = async (i: number) => {
      const t = Date.now()
      const capture = captures.get(frameIds[i]!)
      // A capture deleted since the export was queued renders as an empty frame
      // rather than failing the whole file over one missing moment.
      const traffic = capture ? await slimFor(capture) : null
      timing.dataMs += Date.now() - t
      return { capturedAt: (capture?.capturedAt ?? new Date()).toISOString(), traffic }
    }
    const progress = async (done: number) => {
      const now = Date.now()
      if (done >= frameIds.length || now - lastWrite >= PROGRESS_WRITE_MS) {
        lastWrite = now
        // Lands only while the row is still `rendering` — false means it was cancelled.
        if (!(await exportRepo.reportProgress(exportId, done))) cancelled = true
      }
      return !cancelled
    }
    const path = exportPath(row)

    await withBrowserSlot(
      async () => {
        if (row.format === 'zip') {
          upload = await MultipartUpload.start(path, 'application/zip')
          await exportRepo.setUploadId(exportId, upload.uploadId)
          const zip = new ZipStream((chunk) => upload!.write(chunk))

          // Where each frame comes from (EXP-A2): the capture's own image when this
          // export asks for exactly its style, a frame an earlier export already drew,
          // or — only otherwise — the browser.
          const hash = specHash(spec, zone)
          const cached = await renderCacheRepo.findMany(hash, frameIds)
          const sources = frameIds.map((id): { kind: 'image' | 'cache' | 'render'; path?: string } => {
            const capture = captures.get(id)
            if (capture?.filePath && matchesCaptureImage(capture.styleUsed, spec)) return { kind: 'image', path: capture.filePath }
            const hit = cached.get(id)
            return hit ? { kind: 'cache', path: hit.path } : { kind: 'render' }
          })

          let written = 0
          const append = async (i: number, name: string, data: Buffer) => {
            const t = Date.now()
            await zip.add(name, data)
            timing.writeMs += Date.now() - t
            written = i + 1
            timing.frames = written
          }

          while (written < frameIds.length && !cancelled) {
            const source = sources[written]!
            if (source.kind !== 'render') {
              try {
                const data = await r2.download(source.path!)
                const capture = captures.get(frameIds[written]!)
                await append(written, frameFileName(written, capture?.capturedAt ?? new Date()), data)
                timing.reused++
                await progress(written)
                continue
              } catch {
                // The stored file is gone (expired, deleted): draw this frame instead.
                sources[written] = { kind: 'render' }
              }
            }

            // The run of frames that must be drawn, from here to the next reusable one.
            let end = written
            while (end < frameIds.length && sources[end]!.kind === 'render') end++

            if (!browser?.isConnected()) browser = await launchBrowser()
            try {
              await renderWithPage(
                browser,
                { ...job, startFrame: written, endFrame: end },
                {
                  frame,
                  progress,
                  png: async (i, name, data, stats) => {
                    // After a restart the page starts at `written`; anything else is a
                    // repeat of a frame already in the file.
                    if (i !== written) return
                    await append(i, name, data)
                    if (stats) {
                      timing.drawMs += stats.drawMs
                      timing.encodeMs += stats.encodeMs
                    }
                    // Keep it for a retry or a repeat export of the same style. Never
                    // fatal: a frame that isn't cached is simply drawn again next time.
                    const captureId = frameIds[i]!
                    const key = cachePath(row.userId, hash, captureId)
                    await r2
                      .upload(key, data, 'image/png')
                      .then(() => renderCacheRepo.insert({ specHash: hash, captureId, userId: row.userId, path: key, size: data.length }))
                      .catch((err) => console.warn(`[export] ${exportId} frame ${i + 1} not cached:`, err instanceof Error ? err.message : err))
                  },
                },
                `export ${exportId}`,
              )
              if (!cancelled && written < end) throw new Error(`Render berhenti di frame ${written + 1}.`)
            } catch (err) {
              if (cancelled) break
              if (!isBrowserCrash(err) || timing.restarts >= MAX_BROWSER_RESTARTS) throw err
              timing.restarts++
              console.warn(
                `[export] ${exportId} browser crashed at frame ${written + 1}/${frameIds.length} — ` +
                  `restarting (${timing.restarts}/${MAX_BROWSER_RESTARTS}) and continuing from there`,
              )
              await browser?.close().catch(() => undefined)
              browser = null
            }
          }

          if (cancelled) {
            outcome = 'cancelled'
            return
          }
          await zip.finish()
          // Guarded (#58): false = cancelled or swept while the last frames rendered.
          if (!(await exportRepo.markUploading(exportId))) {
            outcome = 'cancelled'
            return
          }
          await upload.complete()
          const size = upload.bytes
          upload = null
          if (!(await exportRepo.complete(exportId, path, size, expiryFrom(new Date())))) {
            // Cancelled during the final upload: the file exists but nobody wants it.
            await r2.remove(path).catch(() => undefined)
            outcome = 'cancelled'
            return
          }
          outcome = `done (${size} bytes)`
          return
        }

        // WebM: recorded by the page, then uploaded whole — small (≈34 KB/frame).
        browser = await launchBrowser()
        const { video } = await renderWithPage(browser, job, { frame, progress }, `export ${exportId}`)
        timing.frames = frameIds.length
        if (cancelled) {
          outcome = 'cancelled'
          return
        }
        if (video.length === 0) throw new Error('Render selesai tanpa menghasilkan file.')
        if (!(await exportRepo.markUploading(exportId))) {
          outcome = 'cancelled'
          return
        }
        await r2.upload(path, video, 'video/webm')
        if (!(await exportRepo.complete(exportId, path, video.length, expiryFrom(new Date())))) {
          await r2.remove(path).catch(() => undefined)
          outcome = 'cancelled'
          return
        }
        outcome = `done (${video.length} bytes)`
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
    // Anything still open here is unfinished: discard its parts rather than leave them billed.
    const pending = upload as MultipartUpload | null
    if (pending) {
      await pending.abort()
      await exportRepo.setUploadId(exportId, null).catch(() => undefined)
    }
    await (browser as Browser | null)?.close().catch(() => undefined)
    logSummary(exportId, row, spec, timing, startedAt, sampler.stop(), outcome)
  }
}

export async function registerExportConsumer(ch: Channel): Promise<void> {
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
  console.log(`[worker] consuming ${config.rabbitmqQueueExport} (prefetch 1, streamed, one browser per worker)`)
}
