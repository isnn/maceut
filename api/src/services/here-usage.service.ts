import * as usageRepo from '../repositories/here-usage.repository'
import * as here from '../lib/here-traffic-client'
import { TrafficUnavailableError } from '../errors'
import type { HereSource, UsageCounts } from '../repositories/here-usage.repository'

/**
 * HERE usage metering and the budget cap (admin only).
 *
 * Every HERE Traffic call in the platform goes through `meteredTrafficFlow` — the
 * capture worker, the wizard's preview and road counts, and zone stats. That one choke
 * point is what makes both halves possible: every call is counted, per WIB day and per
 * source, and every call is checked against the cap before it is sent.
 *
 * ## The cap
 *
 * Staff set a daily and/or a monthly request limit (either may be off). Once one is
 * reached, calls are REFUSED — not sent, so not billed — and counted as refused, and
 * the customer sees only that traffic data is briefly unavailable. Captures refused
 * this way are recorded as failed with that message, like any other outage.
 *
 * The check is "read the totals, then send", so a burst of parallel calls at the edge
 * can overshoot the cap by a handful of requests. Accepted: an exact cap needs a lock on
 * every HERE call, and the cap is a budget guard, not a meter HERE bills from.
 */

export interface HereBudget {
  /** Max requests per WIB calendar day. Null = no daily cap. */
  dailyLimit: number | null
  /** Max requests per WIB calendar month. Null = no monthly cap. */
  monthlyLimit: number | null
  /** Optional price per 1,000 requests, only to show an estimated spend. */
  costPer1000: number | null
}

export const BUDGET_KEY = 'here_budget'
export const NO_BUDGET: HereBudget = { dailyLimit: null, monthlyLimit: null, costPer1000: null }
/** The share of a limit at which the admin page starts warning. */
export const WARN_AT = 0.8

const BUDGET_CACHE_MS = 15_000
let cached: { at: number; budget: HereBudget } | null = null

/** The configured budget, cached briefly: it's read before every HERE call. */
export async function getBudget(now: number = Date.now()): Promise<HereBudget> {
  if (cached && now - cached.at < BUDGET_CACHE_MS) return cached.budget
  const row = await usageRepo.getSetting(BUDGET_KEY)
  const budget = { ...NO_BUDGET, ...((row?.value as Partial<HereBudget>) ?? {}) }
  cached = { at: now, budget }
  return budget
}

/** Drops the cache — after staff save a new budget, so it applies at once in this process. */
export function forgetBudget(): void {
  cached = null
}

/** A WIB calendar day, "YYYY-MM-DD". */
export function wibDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta' }).format(at)
}

/** The first day of `at`'s WIB month, "YYYY-MM-01". */
export function wibMonthStart(at: Date): string {
  return `${wibDay(at).slice(0, 7)}-01`
}

/** Which limit, if any, the current usage has reached. */
export function limitReached(budget: HereBudget, today: UsageCounts, month: UsageCounts): 'daily' | 'monthly' | null {
  if (budget.dailyLimit !== null && today.requests >= budget.dailyLimit) return 'daily'
  if (budget.monthlyLimit !== null && month.requests >= budget.monthlyLimit) return 'monthly'
  return null
}

/**
 * Refuses the call if a cap is reached. The refusal is recorded against the source, so
 * the admin page shows what the cap actually cost in missed work.
 */
export async function assertWithinBudget(source: HereSource, now: Date = new Date()): Promise<void> {
  const budget = await getBudget(now.getTime())
  if (budget.dailyLimit === null && budget.monthlyLimit === null) return

  const [today, month] = await Promise.all([
    usageRepo.totalsOn(wibDay(now)),
    usageRepo.totalsSince(wibMonthStart(now)),
  ])
  if (limitReached(budget, today, month)) {
    await usageRepo.increment(wibDay(now), source, { refused: 1 })
    throw new TrafficUnavailableError()
  }
}

/**
 * `here.getTrafficFlow`, counted and capped. Every HERE call in the platform goes
 * through this — calling `getTrafficFlow` directly would be an unmetered, uncapped call.
 */
export async function meteredTrafficFlow(
  source: HereSource,
  bbox: here.BBox,
  opts: here.TrafficFlowOptions = {},
): Promise<here.TrafficCollection> {
  await assertWithinBudget(source)
  const day = wibDay(new Date())
  try {
    const flow = await here.getTrafficFlow(bbox, opts)
    await usageRepo.increment(day, source, { requests: 1 }).catch(() => undefined)
    return flow
  } catch (err) {
    // A request that failed was still sent — it counts, and it may still be billed.
    await usageRepo.increment(day, source, { requests: 1, failed: 1 }).catch(() => undefined)
    throw err
  }
}

// --- admin: summary and budget -------------------------------------------------------

export interface UsageDay {
  day: string
  total: number
  failed: number
  refused: number
  bySource: Record<HereSource, number>
}

export interface UsageSummary {
  today: UsageCounts & { day: string }
  month: UsageCounts & { start: string }
  budget: HereBudget
  /** `warning` from 80% of any cap, `blocked` once one is reached. */
  status: 'ok' | 'warning' | 'blocked'
  /** Share of each cap used (1 = reached). Null when that cap is off. */
  dailyUsed: number | null
  monthlyUsed: number | null
  /** Month-to-date requests × the configured price, when one is set. */
  estimatedMonthCost: number | null
  /** The last 30 WIB days, oldest first, every day present even with no calls. */
  days: UsageDay[]
  budgetUpdatedAt: string | null
}

const HISTORY_DAYS = 30

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}

export async function usageSummary(now: Date = new Date()): Promise<UsageSummary> {
  const today = wibDay(now)
  const monthStart = wibMonthStart(now)
  const first = shiftDay(today, -(HISTORY_DAYS - 1))

  const [todayTotals, monthTotals, rows, setting] = await Promise.all([
    usageRepo.totalsOn(today),
    usageRepo.totalsSince(monthStart),
    usageRepo.rowsSince(first),
    usageRepo.getSetting(BUDGET_KEY),
  ])
  const budget: HereBudget = { ...NO_BUDGET, ...((setting?.value as Partial<HereBudget>) ?? {}) }

  const days: UsageDay[] = []
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const day = shiftDay(first, i)
    const onDay = rows.filter((r) => String(r.day) === day)
    const bySource = Object.fromEntries(usageRepo.HERE_SOURCES.map((s) => [s, 0])) as Record<HereSource, number>
    for (const r of onDay) if (r.source in bySource) bySource[r.source as HereSource] += r.requests
    days.push({
      day,
      total: onDay.reduce((sum, r) => sum + r.requests, 0),
      failed: onDay.reduce((sum, r) => sum + r.failed, 0),
      refused: onDay.reduce((sum, r) => sum + r.refused, 0),
      bySource,
    })
  }

  const dailyUsed = budget.dailyLimit ? todayTotals.requests / budget.dailyLimit : null
  const monthlyUsed = budget.monthlyLimit ? monthTotals.requests / budget.monthlyLimit : null
  const worst = Math.max(dailyUsed ?? 0, monthlyUsed ?? 0)

  return {
    today: { day: today, ...todayTotals },
    month: { start: monthStart, ...monthTotals },
    budget,
    status: limitReached(budget, todayTotals, monthTotals) ? 'blocked' : worst >= WARN_AT ? 'warning' : 'ok',
    dailyUsed,
    monthlyUsed,
    estimatedMonthCost: budget.costPer1000 !== null ? Math.round((monthTotals.requests / 1000) * budget.costPer1000 * 100) / 100 : null,
    days,
    budgetUpdatedAt: setting?.updatedAt.toISOString() ?? null,
  }
}

/**
 * Saves the budget. Takes effect at once in the API process; the worker (a separate
 * process) picks it up within its 15-second cache window.
 */
export async function updateBudget(userId: string, budget: HereBudget): Promise<UsageSummary> {
  await usageRepo.setSetting(BUDGET_KEY, budget, userId)
  forgetBudget()
  return usageSummary()
}
