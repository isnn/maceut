import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as paymentService from '../services/payment.service'
import * as autoRenew from '../services/auto-renew.service'
import { NotFoundError, UnauthorizedError } from '../errors'
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

/** Turn auto-renew on: a card-only Snap payment for the current plan (or a higher one) that saves the card. */
export async function enableAutoRenew(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    if (!autoRenew.isAutoRenewEnabled()) throw new NotFoundError('Auto-renew')
    const { plan } = checkoutSchema.parse(req.body)
    return res.status(201).json(ok(await paymentService.checkout(req.userId, plan as Plan, new Date(), { autoRenewSetup: true })))
  } catch (err) {
    next(err)
  }
}

export async function disableAutoRenew(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    if (!autoRenew.isAutoRenewEnabled()) throw new NotFoundError('Auto-renew')
    await autoRenew.stop(req.userId)
    return res.status(200).json(ok({ autoRenew: false }))
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
    const body = req.body ?? {}
    // Auto-renew charges (the dashboard's Recurring Notification URL) arrive here too,
    // in their own shape and without a signature — see auto-renew.service.
    const result =
      typeof body.event_name === 'string' && body.event_name.startsWith('subscription.')
        ? await autoRenew.handleSubscriptionNotification(body)
        : await paymentService.handleNotification(body)
    return res.status(200).json(ok({ result }))
  } catch (err) {
    next(err)
  }
}
