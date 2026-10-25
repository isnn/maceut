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

/**
 * Marks sign-up finished. Takes no body.
 *
 * It used to accept a plan, which is how a brand-new account could award itself
 * Premium. Everyone starts on Free; staff grant paid plans from `/internal/users`.
 */
export async function completeOnboarding(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    return res.status(200).json(ok(await userService.completeOnboarding(req.userId)))
  } catch (err) {
    next(err)
  }
}

/**
 * Downgrades only — an upgrade is refused with UPGRADE_NOT_SELF_SERVE until billing
 * exists. See the note on userService.changeOwnPlan.
 *
 * Returns what was paused alongside the user, so the screen can report the outcome
 * in the same shape the confirmation dialog previewed.
 */
export async function changeOwnPlan(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const { plan } = onboardingSchema.parse(req.body)
    return res.status(200).json(ok(await userService.changeOwnPlan(req.userId, plan as Plan)))
  } catch (err) {
    next(err)
  }
}

/**
 * What a plan change would pause, without changing anything (ADR-020).
 *
 * Backs the confirmation dialog. It runs the same function the change itself runs, so
 * what the user is warned about and what actually happens cannot drift apart.
 */
export async function planImpact(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const { plan } = onboardingSchema.parse({ plan: req.query.plan })
    return res.status(200).json(ok(await userService.previewPlanChange(req.userId, plan as Plan)))
  } catch (err) {
    next(err)
  }
}
