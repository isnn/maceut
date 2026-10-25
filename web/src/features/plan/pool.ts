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

/** An average month, the same 52 ÷ 12 weeks the projection uses. */
const AVG_MONTH_MS = ((52 * 7) / 12) * 24 * 60 * 60 * 1000

/**
 * What the windows are on course to take before the pool resets: their average month,
 * scaled to the time left in this one. Comparing a whole month against what is left on
 * the 12th warned about captures that were never going to happen this month.
 */
export function projectedUntilReset(projectedPerMonth: number, pool: CapturePool, now: Date = new Date()): number {
  const left = Math.max(0, new Date(pool.resetsAt).getTime() - now.getTime())
  return Math.round(projectedPerMonth * Math.min(1, left / AVG_MONTH_MS))
}

export type PoolOutlook =
  /** The windows will run out this month's pool before it resets. */
  | { kind: 'short_this_month'; untilReset: number }
  /** Fine this month, but an average month needs more than the plan holds. */
  | { kind: 'over_plan' }
  | { kind: 'ok' }

/**
 * How the collecting windows sit against the pool (F6). A warning only: windows are never
 * blocked for it; captures past the pool are skipped and recorded (BR-008).
 */
export function poolOutlook(projectedPerMonth: number, pool: CapturePool | null | undefined, now: Date = new Date()): PoolOutlook {
  if (!pool) return { kind: 'ok' }
  const untilReset = projectedUntilReset(projectedPerMonth, pool, now)
  if (untilReset > pool.remaining) return { kind: 'short_this_month', untilReset }
  if (projectedPerMonth > pool.limit) return { kind: 'over_plan' }
  return { kind: 'ok' }
}
