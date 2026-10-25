/**
 * A paid period running out (FE-56) — checked when the plan is read, not by a timer.
 *
 * Every place that loads an account's plan to act on it (/me on each page load, the
 * plan-checked routes, usage, captures — including scheduled ones — and exports) passes
 * it through `settle()` first. Past `expires_at`, the account moves to Free right there,
 * with the usual pause-what-doesn't-fit pass (ADR-020), and that same request already
 * sees Free limits.
 *
 * What this costs in the common case: one date comparison on a row already loaded.
 * What it doesn't do: move an account nobody touches — it stays labelled paid in
 * Internal until its next request. That gives nothing away: the paid limits only
 * matter when something uses them, and every such path settles first.
 *
 * Plans staff set have no end date (NULL) and never expire.
 */
import * as userRepo from '../repositories/user.repository'
import * as planChangeRepo from '../repositories/plan-change.repository'
import * as planService from './plan.service'
import * as notificationService from './notification.service'
import { RETRY_DAYS, stopQuietly } from './auto-renew.service'

export async function settle<T extends userRepo.UserWithPlan>(account: T, now: Date = new Date()): Promise<T> {
  const end = account.planExpiresAt
  if (!end || account.plan === 'free') return account
  // With auto-renew on, Midtrans may still be retrying a declined card for a few days.
  const graceMs = account.autoRenew ? RETRY_DAYS * 86_400_000 : 0
  if (end.getTime() + graceMs > now.getTime()) return account

  const moved = await userRepo.expireToFree(account.id, end)
  if (moved) {
    if (account.autoRenew) await stopQuietly(account.id)
    const impact = await planService.applyPlanChange(account.id, 'free')
    await planChangeRepo.record({ userId: account.id, fromPlan: account.plan, toPlan: 'free', source: 'expiry' })
    await notificationService.onPlanExpired(account.id, {
      from: account.plan,
      expiresAt: end,
      paused: [...impact.zonesToPause, ...impact.schedulesToPause].map((i) => i.name),
    })
    console.log(`[plan-expiry] ${account.id}: ${account.plan} ended ${end.toISOString()}, now Free`)
  }
  if (moved) return { ...account, plan: 'free', planExpiresAt: null }
  // Not moved here: another request expired it first, or a renewal set a new end date
  // in between. Read what is true now rather than guess.
  return ((await userRepo.findByIdWithPlan(account.id)) as T | undefined) ?? account
}

/** `findByIdWithPlan`, settled. The one call sites use instead of the raw lookup. */
export async function findSettled(userId: string, now: Date = new Date()): Promise<userRepo.UserWithPlan | undefined> {
  const account = await userRepo.findByIdWithPlan(userId)
  return account ? settle(account, now) : undefined
}
