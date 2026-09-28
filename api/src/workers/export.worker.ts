import type { Channel, ConsumeMessage } from 'amqplib'
import type { Browser } from 'playwright-core'
import { launchBrowser, renderWithPage, type RenderPageJob } from '../lib/render-page'
import { config } from '../config/env'
import * as exportRepo from '../repositories/export.repository'
import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import { slimTraffic } from '../services/capture.service'
import { exportPath, expiryFrom, type StoredSpec } from '../services/export.service'
import * as r2 from '../lib/r2-client'
import { buildZip } from '../lib/zip'

/**
 * Renders Studio exports (FE-21) — a ZIP of frames or a WebM animation — in headless
 * Chromium, so a long export no longer depends on the user keeping a tab open.
 *
 * ## Same renderer, by construction
 *
 * Nothing here draws. The worker opens Studio's own render page (`/render/export` on
 * the web app) and hands it the job; that page runs the exact `renderCapture` and
 * `recordAnimation` Studio's preview uses. A second, server-side renderer would drift
 * from the preview one palette tweak at a time. This way the file is the preview.
 *
 * The page is a bare shell with no data of its own: it asks the worker for each frame
 * (`__exportFrame`), reports progress (`__exportProgress`), and hands back its output
 * (`__exportPng` / `__exportChunk`) — Playwright's exposeFunction, in-process, so the
 * page needs no session, token or network access to the API.
 *
 * ## Progress
 *
 * The page reports every frame; the worker writes at most once a second (and always on
 * the last frame) to `exports.frames_done`, which is what every progress bar reads.
 * Each write also touches `updated_at`: the heartbeat the sweeper checks.
 *
 * ## One at a time
 *
 * prefetch 1. A headless Chromium rendering 1920px frames takes hundreds of MB, and
 * this host has repeatedly OOM-killed browsers. Two at once would risk both.
 */

interface ExportJob {
  exportId: string
}

const PROGRESS_WRITE_MS = 1000
const HEARTBEAT_MS = 30_000

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
  let browser: Browser | null = null
  const heartbeat = setInterval(() => void exportRepo.touch(exportId).catch(() => undefined), HEARTBEAT_MS)

  try {
    const zone = await zoneRepo.findById(row.zoneId)
    if (!zone) throw new Error('Zona sudah dihapus.')

    browser = await launchBrowser()
    let cancelled = false
    let lastWrite = 0
    const job: RenderPageJob = {
      format: row.format,
      spec,
      frameCount: frameIds.length,
      zoneName: spec.zoneName,
      ring: zone.geometry.coordinates[0] as [number, number][],
    }
    const { pngs, video } = await renderWithPage(
      browser,
      job,
      {
        frame: async (i) => {
          const capture = await captureRepo.findById(frameIds[i]!)
          // A capture deleted since the export was queued renders as an empty frame
          // rather than failing the whole file over one missing moment.
          return {
            capturedAt: (capture?.capturedAt ?? new Date()).toISOString(),
            traffic: capture?.traffic ? slimTraffic(capture.traffic) : null,
          }
        },
        progress: async (done) => {
          const now = Date.now()
          if (done >= frameIds.length || now - lastWrite >= PROGRESS_WRITE_MS) {
            lastWrite = now
            // Lands only while the row is still `rendering` — false means it was cancelled.
            if (!(await exportRepo.reportProgress(exportId, done))) cancelled = true
          }
          return !cancelled
        },
      },
      `export ${exportId}`,
    )

    if (cancelled) {
      console.log(`[export] ${exportId} cancelled`)
      return
    }

    const file = row.format === 'zip' ? buildZip(pngs) : video
    if (file.length === 0) throw new Error('Render selesai tanpa menghasilkan file.')

    await exportRepo.markUploading(exportId)
    const path = exportPath(row)
    await r2.upload(path, file, row.format === 'zip' ? 'application/zip' : 'video/webm')
    await exportRepo.complete(exportId, path, file.length, expiryFrom(new Date()))
    console.log(`[export] ${exportId} done — ${row.format}, ${frameIds.length} frames, ${file.length} bytes`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[export] ${exportId} failed: ${message}`)
    await exportRepo.fail(exportId, message.slice(0, 500))
  } finally {
    clearInterval(heartbeat)
    await browser?.close().catch(() => undefined)
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
  console.log(`[worker] consuming ${config.rabbitmqQueueExport} (prefetch 1)`)
}
