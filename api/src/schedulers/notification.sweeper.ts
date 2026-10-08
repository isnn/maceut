import * as notificationService from '../services/notification.service'

/**
 * Every 10 minutes, in the API process beside the capture scheduler: decides the
 * notification emails that have come due (NOTIF), and once an hour trims the bell to
 * its 90-day retention.
 *
 * Ten minutes because the only delayed email waits two hours — a few minutes either
 * way changes nothing, and a quiet tick costs one indexed query.
 */

const TICK_MS = 10 * 60 * 1000
const PRUNE_EVERY_TICKS = 6

let timer: NodeJS.Timeout | null = null
let ticks = 0

export async function sweepOnce(now: Date = new Date()): Promise<void> {
  const r = await notificationService.runEmailSweep(now)
  if (r.sent || r.skipped || r.failed) {
    console.log(`[notify-sweeper] emails: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed`)
  }
  if (ticks++ % PRUNE_EVERY_TICKS === 0) {
    const pruned = await notificationService.pruneOld(now)
    if (pruned) console.log(`[notify-sweeper] pruned ${pruned} notifications older than 90 days`)
  }
}

export function startNotificationSweeper(): void {
  if (timer) return
  timer = setInterval(() => {
    sweepOnce().catch((err) => console.error('[notify-sweeper] tick failed:', err instanceof Error ? err.message : err))
  }, TICK_MS)
  timer.unref()
}

export function stopNotificationSweeper(): void {
  if (timer) clearInterval(timer)
  timer = null
}
