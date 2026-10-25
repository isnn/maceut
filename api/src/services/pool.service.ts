import * as captureRepo from '../repositories/capture.repository'
import { wibMonth } from '../lib/capture-pool'
import { PLAN_LIMITS, type Plan } from '../types/plan'

/**
 * Where an account stands against its monthly capture pool (BR-006, delivery doc F5/F7).
 * Derived from the captures table on every read, so there is no counter to drift.
 */
export interface PoolStatus {
  /** The plan's pool for this WIB month. */
  limit: number
  used: number
  remaining: number
  /** 00:00 WIB on the 1st of next month: when `used` goes back to 0. */
  resetsAt: string
}

export function poolStatusFrom(plan: Plan, used: number, now: Date = new Date()): PoolStatus {
  const limit = PLAN_LIMITS[plan].monthlyCaptures
  return { limit, used, remaining: Math.max(limit - used, 0), resetsAt: wibMonth(now).end.toISOString() }
}

export async function getPoolStatus(userId: string, plan: Plan, now: Date = new Date()): Promise<PoolStatus> {
  const month = wibMonth(now)
  return poolStatusFrom(plan, await captureRepo.countInRange(userId, month.start, month.end), now)
}
