import type { Request, Response, NextFunction } from 'express'
import * as workspaceService from '../services/workspace.service'
import * as workspaceRepo from '../repositories/workspace.repository'
import { UnauthorizedError } from '../errors'
import type { Capability } from '../types/workspace'

/**
 * Resolves which workspace the caller is acting in, and their role there.
 *
 * Replaces the old `planCheck`. That one loaded a plan attached to the *user*; plans
 * now belong to the workspace, because seats, zone counts and daily captures are what
 * the account bought rather than what each person gets.
 *
 * Runs after `authMiddleware`. It also creates the personal workspace for an account
 * that has none, so a user created by Better Auth — which knows nothing about
 * workspaces — is never left without one.
 */
export async function workspaceContext(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.userId) return next(new UnauthorizedError())

    const context = await workspaceService.ensureWorkspace(req.userId)

    req.workspaceId = context.workspaceId
    req.workspaceName = context.workspaceName
    req.memberRole = context.role
    req.plan = await workspaceRepo.getPlan(context.workspaceId)

    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Gates a route on a capability.
 *
 * Read routes need none — membership alone is enough. Writes need `write`, and
 * anything touching members or the plan needs `manage`. Applied at the route rather
 * than inside each service so an unguarded route is visible in the router.
 */
export function requireCapability(capability: Capability) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.memberRole) return next(new UnauthorizedError())
      workspaceService.requireCapability(req.memberRole, capability)
      next()
    } catch (err) {
      next(err)
    }
  }
}
