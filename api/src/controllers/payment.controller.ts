import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as paymentService from '../services/payment.service'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'
import { PLANS, type Plan } from '../types/plan'

const checkoutSchema = z.object({
  plan: z.enum(PLANS as unknown as [string, ...string[]], { errorMap: () => ({ message: 'Unknown plan.' }) }),
})

export async function prices(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(ok(paymentService.prices()))
  } catch (err) {
    next(err)
  }
}

export async function checkout(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const { plan } = checkoutSchema.parse(req.body)
    return res.status(201).json(ok(await paymentService.checkout(req.userId, plan as Plan)))
  } catch (err) {
    next(err)
  }
}

export async function pending(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    return res.status(200).json(ok(await paymentService.pending(req.userId)))
  } catch (err) {
    next(err)
  }
}

export async function history(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    return res.status(200).json(ok(await paymentService.history(req.userId)))
  } catch (err) {
    next(err)
  }
}

export async function show(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    return res.status(200).json(ok(await paymentService.sync(req.userId, String(req.params.orderId))))
  } catch (err) {
    next(err)
  }
}

/**
 * Midtrans' HTTP notification. No session: it is authenticated by its signature
 * (403 when that fails). Every accepted notification — including one for an order this
 * server doesn't know — answers 200 so Midtrans stops retrying; a database failure
 * falls through to the error handler's 500, which Midtrans does retry.
 */
export async function notification(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.handleNotification(req.body ?? {})
    return res.status(200).json(ok({ result }))
  } catch (err) {
    next(err)
  }
}
