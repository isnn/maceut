import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as hereUsage from '../services/here-usage.service'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'

const limit = z.number().int().min(1, 'Batas minimal 1.').max(100_000_000).nullable()

export const budgetSchema = z.object({
  dailyLimit: limit,
  monthlyLimit: limit,
  costPer1000: z.number().min(0).max(100_000).nullable(),
  /** Where budget alerts are emailed. Optional so older clients that don't send it keep working. */
  alertEmail: z.string().trim().toLowerCase().email('Alamat email tidak valid.').nullable().optional().default(null),
})

/** HERE usage and the budget cap — staff only. */
export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    return res.status(200).json(ok(await hereUsage.usageSummary()))
  } catch (err) {
    next(err)
  }
}

export async function updateBudget(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const budget = budgetSchema.parse(req.body)
    return res.status(200).json(ok(await hereUsage.updateBudget(req.userId, budget)))
  } catch (err) {
    next(err)
  }
}
