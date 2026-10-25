import * as exportRepo from '../repositories/export.repository'
import * as r2 from '../lib/r2-client'
import { exportPath } from '../services/export.service'
import * as renderCacheRepo from '../repositories/render-cache.repository'
import { RENDER_CACHE_DAYS } from '../services/render-cache.service'
import * as notificationService from '../services/notification.service'

/**
 * Keeps the exports table honest (FE-21), once a minute, in the API process beside the
 * capture scheduler.
 *
 * 1. **Stale renders.** A render whose heartbeat (`updated_at`) is over two minutes old
 *    lost its worker — most likely OOM-killed mid-job, which this host has done to
 *    headless browsers repeatedly. Without this its progress bar would sit at the frame
 *    it died on forever, and the "one export at a time" rule would block the account.
 * 2. **Expiry.** Finished files past their retention are deleted from R2; the row stays
 *    as `expired`, so the history still says the export existed.
 */

const STALE_AFTER_MS = 2 * 60 * 1000
const TICK_MS = 60 * 1000

export interface SweepResult {
  failed: number
  expired: number
  /** Render-cache frames past retention, deleted with their files (EXP-A2). */
  cachePruned: number
}

export async function sweep(now: Date = new Date()): Promise<SweepResult> {
  let failed = 0
  for (const row of await exportRepo.findStale(new Date(now.getTime() - STALE_AFTER_MS))) {
    if (await exportRepo.fail(row.id, 'Render berhenti di tengah jalan. Silakan coba lagi.')) {
      // The cause is for the log; the user is told to retry.
      console.warn(`[export-sweeper] ${row.id} stalled — no heartbeat since ${row.updatedAt.toISOString()} (worker likely killed)`)
      // Its worker died with an upload open: abort it, or the parts stay in R2, billed.
      if (row.uploadId) {
        await r2.MultipartUpload.abortById(exportPath(row), row.uploadId).catch((err) =>
          console.error(`[export-sweeper] could not abort upload for ${row.id}:`, err instanceof Error ? err.message : err),
        )
        await exportRepo.setUploadId(row.id, null)
      }
      failed++
      await notificationService.onExportFinished(row.id)
    }
  }

  let expired = 0
  for (const row of await exportRepo.findExpired(now)) {
    try {
      if (row.filePath) await r2.remove(row.filePath)
      await exportRepo.markExpired(row.id)
      expired++
    } catch (err) {
      // Left `done` so the next tick retries; the file is still there to delete.
      console.error(`[export-sweeper] could not expire ${row.id}:`, err instanceof Error ? err.message : err)
    }
  }
  let cachePruned = 0
  const cacheBefore = new Date(now.getTime() - RENDER_CACHE_DAYS * 24 * 60 * 60 * 1000)
  for (const entry of await renderCacheRepo.findOlderThan(cacheBefore)) {
    try {
      await r2.remove(entry.path)
      await renderCacheRepo.remove(entry.specHash, entry.captureId)
      cachePruned++
    } catch (err) {
      console.error(`[export-sweeper] could not prune cached frame ${entry.path}:`, err instanceof Error ? err.message : err)
    }
  }
  return { failed, expired, cachePruned }
}

let timer: NodeJS.Timeout | null = null

export function startExportSweeper(): void {
  if (timer) return
  timer = setInterval(() => {
    sweep()
      .then((r) => {
        if (r.failed || r.expired || r.cachePruned)
          console.log(`[export-sweeper] failed ${r.failed} stale, expired ${r.expired}, pruned ${r.cachePruned} cached frames`)
      })
      .catch((err) => console.error('[export-sweeper] tick failed:', err instanceof Error ? err.message : err))
  }, TICK_MS)
  timer.unref()
}

export function stopExportSweeper(): void {
  if (timer) clearInterval(timer)
  timer = null
}
