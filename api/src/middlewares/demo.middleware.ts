import type { Request, Response, NextFunction } from 'express'
import { DemoAccountLockedError, UnauthorizedError } from '../errors'
import { isDemoUser } from '../lib/demo'
import { config } from '../config/env'
import * as userRepo from '../repositories/user.repository'

/**
 * Refuses the route for the shared demo account (403 DEMO_ACCOUNT_LOCKED). Runs after
 * authMiddleware. The Profile page disables these controls for the demo too, but that
 * is only UI: this is the enforcement.
 */
export async function demoGuard(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!config.demoEnabled) return next()
    if (!req.userId) return next(new UnauthorizedError())
    const user = await userRepo.findById(req.userId)
    if (user && isDemoUser(user.email)) return next(new DemoAccountLockedError())
    next()
  } catch (err) {
    next(err)
  }
}
