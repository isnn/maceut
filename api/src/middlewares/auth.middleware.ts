import type { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../lib/auth'
import { UnauthorizedError, ForbiddenError } from '../errors'
import * as userRepo from '../repositories/user.repository'
import { resolveRole } from '../lib/internal-access'
import type { PlatformRole } from '../types/plan'

/**
 * Bridges Better Auth's session into this API's request shape.
 *
 * The session is a row Better Auth looks up, not a self-contained token, so a signed
 * out or revoked session stops working immediately rather than lingering until it
 * expires. That is the whole reason for using it over a stateless JWT.
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    if (!session?.user) return next(new UnauthorizedError())

    req.userId = session.user.id
    next()
  } catch {
    // A malformed cookie makes Better Auth throw rather than return null. That is
    // still just "not signed in", not a server fault.
    next(new UnauthorizedError())
  }
}

/**
 * Loads the user's plan onto the request (BR-007 needs it in the service layer).
 * Must run after authMiddleware.
 */
export async function planCheck(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.userId) return next(new UnauthorizedError())

    const found = await userRepo.findByIdWithPlan(req.userId)
    // A valid session for an account that no longer exists — deleted since signing in.
    if (!found) return next(new UnauthorizedError())

    req.plan = found.plan
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Restricts a route to Maceut staff.
 *
 * The role is re-resolved on every request rather than read from the session, so a
 * demotion takes effect at once instead of lingering until the session expires.
 * Note that config grants but does not revoke (see internal-access.ts): dropping an
 * address from INTERNAL_EMAILS only removes access if the account was not also
 * promoted in the database.
 *
 * This is the real enforcement; the frontend's `/internal` gate is only UI.
 */
export async function internalOnly(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.userId) return next(new UnauthorizedError())

    const found = await userRepo.findById(req.userId)
    if (!found) return next(new UnauthorizedError())

    // `role` is nullable in Better Auth's generated schema (it carries a default,
    // not a NOT NULL), so an absent value means an ordinary user.
    if (resolveRole(found.email, (found.role ?? 'user') as PlatformRole) !== 'internal') {
      return next(new ForbiddenError('Halaman ini hanya untuk staf Maceut.'))
    }
    next()
  } catch (err) {
    next(err)
  }
}
