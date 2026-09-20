import type { Request, Response, NextFunction } from 'express'
import * as usageService from '../services/usage.service'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'

/** Dashboard summary (F-19). Thin: call the service, format. */
export async function usage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()

    const [summary, health] = await Promise.all([
      usageService.getUsage(req.userId),
      usageService.getCollectionHealth(req.userId),
    ])

    return res.status(200).json(ok({ ...summary, health }))
  } catch (err) {
    next(err)
  }
}
