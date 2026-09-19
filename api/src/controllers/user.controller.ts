import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as userService from '../services/user.service'
import { listUsersQuerySchema, changePlanSchema, changeRoleSchema } from '../schemas/user.schema'
import { UnauthorizedError } from '../errors'
import { ok, paginated } from '../types/api'
import type { Plan, PlatformRole } from '../types/plan'

/**
 * Not `.uuid()`: Better Auth issues its own string ids for `user.id` (the column is
 * `text`), so a UUID check would reject every real account. The bound is only there
 * to stop an absurd path segment reaching the database.
 */
const userIdParam = z.string().trim().min(1, 'Id user tidak valid.').max(128, 'Id user tidak valid.')

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = listUsersQuerySchema.parse(req.query)
    const result = await userService.listUsers(q as userService.ListUsersParams)

    return res.status(200).json(
      paginated(result.users, {
        total: result.total,
        page: result.page,
        limit: result.limit,
        total_pages: result.totalPages,
      }),
    )
  } catch (err) {
    next(err)
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = userIdParam.parse(req.params.id)
    return res.status(200).json(ok(await userService.getUser(id)))
  } catch (err) {
    next(err)
  }
}

export async function changePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const id = userIdParam.parse(req.params.id)
    const { plan } = changePlanSchema.parse(req.body)
    return res.status(200).json(ok(await userService.changePlan(id, plan as Plan)))
  } catch (err) {
    next(err)
  }
}

export async function changeRole(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const id = userIdParam.parse(req.params.id)
    const { role } = changeRoleSchema.parse(req.body)
    // The actor is passed through so the service can refuse self-edits.
    return res.status(200).json(ok(await userService.changeRole(req.userId, id, role as PlatformRole)))
  } catch (err) {
    next(err)
  }
}

export async function stats(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(ok(await userService.getPlatformStats()))
  } catch (err) {
    next(err)
  }
}
