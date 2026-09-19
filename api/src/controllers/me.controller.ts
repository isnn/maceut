import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as userService from '../services/user.service'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'
import { PLANS, type Plan } from '../types/plan'

const onboardingSchema = z.object({
  plan: z.enum(PLANS as unknown as [string, ...string[]], {
    errorMap: () => ({ message: 'Paket tidak dikenal.' }),
  }),
})

/**
 * The signed-in user, in this API's envelope.
 *
 * Better Auth's own `/api/auth/get-session` returns the session in its shape, which
 * the auth module's client uses. This endpoint exists because every screen outside
 * sign-in needs the *application's* view of the user — plan, resolved platform role,
 * onboarding state — which Better Auth knows nothing about.
 */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    // Reconciles the plan row and the config-driven role, both of which can be out of
    // date the moment an account is created or INTERNAL_EMAILS changes.
    return res.status(200).json(ok(await userService.reconcileAfterSignIn(req.userId)))
  } catch (err) {
    next(err)
  }
}

export async function completeOnboarding(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const { plan } = onboardingSchema.parse(req.body)
    return res.status(200).json(ok(await userService.completeOnboarding(req.userId, plan as Plan)))
  } catch (err) {
    next(err)
  }
}

/** See the warning on userService.changeOwnPlan — this is ungated until billing. */
export async function changeOwnPlan(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const { plan } = onboardingSchema.parse(req.body)
    return res.status(200).json(ok(await userService.changeOwnPlan(req.userId, plan as Plan)))
  } catch (err) {
    next(err)
  }
}
