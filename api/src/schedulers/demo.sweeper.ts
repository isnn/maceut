import { config } from '../config/env'
import * as userRepo from '../repositories/user.repository'
import { wibDay } from '../services/here-usage.service'
import { resetDemoAccount } from '../services/demo.service'

/**
 * Rebuilds the demo account (demo.service) once per WIB day, in the API process beside
 * the other sweepers. Off unless DEMO_ENABLED.
 *
 * Checked every minute against the account itself rather than a timer aimed at
 * midnight: the reset is due when the account is missing or was created on an earlier
 * WIB day. So the first tick after 00:00 WIB rebuilds it, a restart over midnight
 * still does, and a restart in the middle of the day does not throw visitors out.
 */

const TICK_MS = 60 * 1000

let timer: NodeJS.Timeout | null = null
let running = false

/** Whether the demo is due a reset at `now`. */
export async function resetDue(now: Date = new Date()): Promise<boolean> {
  const demo = await userRepo.findByEmail(config.demoEmail)
  return !demo || wibDay(demo.createdAt) < wibDay(now)
}

/** One check. Never runs two resets at once — a slow one (images to copy) can outlast a tick. */
export async function tickOnce(now: Date = new Date()): Promise<boolean> {
  if (running) return false
  running = true
  try {
    if (!(await resetDue(now))) return false
    const r = await resetDemoAccount(now)
    console.log(
      `[demo] ${r.replaced ? 'reset' : 'created'} ${config.demoEmail}: ${r.seededCaptures} sample captures` +
        `${r.sampleDay ? ` from ${r.sampleDay}` : ''}, ${r.filesRemoved} old files removed`,
    )
    return true
  } finally {
    running = false
  }
}

export function startDemoSweeper(): void {
  if (timer || !config.demoEnabled) return
  const run = () => tickOnce().catch((err) => console.error('[demo] reset failed:', err instanceof Error ? err.message : err))
  void run()
  timer = setInterval(run, TICK_MS)
  timer.unref()
}

export function stopDemoSweeper(): void {
  if (timer) clearInterval(timer)
  timer = null
}
