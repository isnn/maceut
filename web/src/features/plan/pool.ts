/**
 * The monthly capture pool (BR-006, delivery doc F5–F7), as the API reports it.
 * Counted per WIB calendar month and shared by every zone and window.
 */
export interface CapturePool {
  limit: number
  used: number
  remaining: number
  /** ISO instant: 00:00 WIB on the 1st of next month, when `used` returns to 0. */
  resetsAt: string
}

/** "1 Nov": the day the pool resets, in Jakarta. */
export function poolResetDay(pool: Pick<CapturePool, 'resetsAt'>): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' }).format(new Date(pool.resetsAt))
}

/**
 * True when the active windows' average month (week × 52 ÷ 12) needs more than what is
 * left of this month's pool (F6). A warning only: windows are never blocked for it; the
 * captures past the pool are skipped and recorded (BR-008).
 */
export function projectionExceedsPool(projectedPerMonth: number, pool: CapturePool | null | undefined): boolean {
  return !!pool && projectedPerMonth > pool.remaining
}
