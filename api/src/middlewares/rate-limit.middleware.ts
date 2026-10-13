import type { Request, Response, NextFunction } from 'express'
import { config } from '../config/env'
import { RateLimitedError } from '../errors'
import { resolveRole } from '../lib/internal-access'
import * as userRepo from '../repositories/user.repository'
import type { PlatformRole } from '../types/plan'

/**
 * Per-account limit on the wizard calls that reach HERE: map previews, road-class counts
 * and place search, counted together. Without it one account (or a script) could spend
 * the whole HERE daily cap, and reaching that cap stops every customer's captures too.
 *
 * In-process sliding windows: the API runs as one container. A second instance would
 * need these counters in Postgres or Redis instead.
 */

const TEN_MIN = 10 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000
const hits = new Map<string, number[]>()

export interface RateLimits {
  per10Min: number
  perDay: number
}

/** Seconds until the account may call again, or 0 if it may now. Records the call when allowed. */
export function take(userId: string, limits: RateLimits, now: number = Date.now()): number {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < DAY)
  const inTen = recent.filter((t) => now - t < TEN_MIN)
  if (inTen.length >= limits.per10Min) return Math.ceil((inTen[0]! + TEN_MIN - now) / 1000)
  if (recent.length >= limits.perDay) return Math.ceil((recent[0]! + DAY - now) / 1000)
  recent.push(now)
  hits.set(userId, recent)
  return 0
}

/** Test seam. */
export function resetRateLimits(): void {
  hits.clear()
}

/** Must run after authMiddleware. Staff are not limited. */
export async function previewRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) return next()
    const wait = take(req.userId, { per10Min: config.previewRatePer10Min, perDay: config.previewRatePerDay })
    if (wait === 0) return next()
    // Only looked up when over the limit, so the common path costs no query.
    const user = await userRepo.findById(req.userId)
    if (user && resolveRole(user.email, (user.role ?? 'user') as PlatformRole) === 'internal') return next()
    res.setHeader('Retry-After', String(wait))
    next(new RateLimitedError(wait))
  } catch (err) {
    next(err)
  }
}
