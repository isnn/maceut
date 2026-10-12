import * as captureRepo from '../repositories/capture.repository'
import * as r2 from '../lib/r2-client'
import { config, isR2Configured } from '../config/env'

/**
 * Capture retention (H1, ADR-035), hourly, in the API process beside the other sweepers.
 *
 * 1. **Soft delete at 30 days.** A capture older than that gets `deleted_at` and every
 *    user list hides it. Nothing else changes: the row, its traffic and its image stay,
 *    so an operator can restore it by clearing `deleted_at` (owner decision 2026-10-12).
 *    The monthly pool and the operator figures still count it.
 * 2. **Hard delete at 6 months (180 days).** The row goes, and its image and thumbnail in R2.
 *
 * Batched and idempotent: each step takes BATCH rows per statement, at most MAX_BATCHES
 * per tick, so a first run over a large backlog spreads over several hours instead of
 * holding one long update. A row a step already handled no longer matches it.
 *
 * Off unless RETENTION_SWEEPER_ENABLED=true: the owner reads `npm run retention:dry-run`
 * against the real data first.
 */

export const SOFT_DELETE_AFTER_DAYS = 30
export const HARD_DELETE_AFTER_DAYS = 180

const DAY_MS = 24 * 60 * 60 * 1000
const BATCH = 500
const MAX_BATCHES = 20
const TICK_MS = 60 * 60 * 1000

export interface RetentionCutoffs {
  /** Captures taken before this are soft-deleted. */
  softBefore: Date
  /** Captures taken before this are deleted for good. */
  purgeBefore: Date
}

export function cutoffs(now: Date = new Date()): RetentionCutoffs {
  return {
    softBefore: new Date(now.getTime() - SOFT_DELETE_AFTER_DAYS * DAY_MS),
    purgeBefore: new Date(now.getTime() - HARD_DELETE_AFTER_DAYS * DAY_MS),
  }
}

export interface RetentionResult {
  softDeleted: number
  purged: number
  /** Image files (and their thumbnails) removed from R2. */
  filesRemoved: number
}

export async function sweepRetention(now: Date = new Date()): Promise<RetentionResult> {
  const { softBefore, purgeBefore } = cutoffs(now)
  const result: RetentionResult = { softDeleted: 0, purged: 0, filesRemoved: 0 }

  for (let i = 0; i < MAX_BATCHES; i++) {
    const n = await captureRepo.softDeleteBefore(softBefore, BATCH, now)
    result.softDeleted += n
    if (n < BATCH) break
  }

  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await captureRepo.findPurgeable(purgeBefore, BATCH)
    if (rows.length === 0) break

    // Files first, rows second: a row whose file could not be removed stays, so the next
    // tick retries it. The other way round would leave files nobody can find again.
    const done: string[] = []
    for (const row of rows) {
      if (!row.filePath) {
        done.push(row.id)
        continue
      }
      if (!isR2Configured()) continue
      try {
        await r2.remove(row.filePath)
        await r2.remove(r2.thumbnailPath(row.filePath))
        result.filesRemoved++
        done.push(row.id)
      } catch (err) {
        console.error(`[retention] could not remove ${row.filePath}:`, err instanceof Error ? err.message : err)
      }
    }
    result.purged += await captureRepo.deleteByIds(done)
    // Nothing removable in this batch (R2 down or unconfigured): stop rather than re-read it.
    if (done.length === 0 || rows.length < BATCH) break
  }

  return result
}

let timer: NodeJS.Timeout | null = null

export function startRetentionSweeper(): void {
  if (timer) return
  if (!config.retentionSweeperEnabled) {
    console.log('[retention] off — set RETENTION_SWEEPER_ENABLED=true after reading `npm run retention:dry-run`')
    return
  }
  const run = () =>
    sweepRetention()
      .then((r) => {
        if (r.softDeleted || r.purged)
          console.log(`[retention] soft-deleted ${r.softDeleted}, purged ${r.purged} (${r.filesRemoved} files)`)
      })
      .catch((err) => console.error('[retention] tick failed:', err instanceof Error ? err.message : err))
  void run()
  timer = setInterval(run, TICK_MS)
  timer.unref()
}

export function stopRetentionSweeper(): void {
  if (timer) clearInterval(timer)
  timer = null
}
