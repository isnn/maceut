import * as exportRepo from '../repositories/export.repository'
import * as r2 from '../lib/r2-client'
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
}

export async function sweep(now: Date = new Date()): Promise<SweepResult> {
  let failed = 0
  for (const row of await exportRepo.findStale(new Date(now.getTime() - STALE_AFTER_MS))) {
    if (await exportRepo.fail(row.id, 'Render berhenti di tengah jalan. Silakan coba lagi.')) {
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
  return { failed, expired }
}

let timer: NodeJS.Timeout | null = null

export function startExportSweeper(): void {
  if (timer) return
  timer = setInterval(() => {
    sweep()
      .then((r) => {
        if (r.failed || r.expired) console.log(`[export-sweeper] failed ${r.failed} stale, expired ${r.expired}`)
      })
      .catch((err) => console.error('[export-sweeper] tick failed:', err instanceof Error ? err.message : err))
  }, TICK_MS)
  timer.unref()
}

export function stopExportSweeper(): void {
  if (timer) clearInterval(timer)
  timer = null
}
