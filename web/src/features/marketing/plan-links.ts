import { PLAN_LABEL } from '@/lib/constants'
import type { Plan } from '@/features/auth/types'

/**
 * Where each plan card points on public pages (FE-37). Paid plans carry the choice to
 * sign-up as `?plan=`; the account still starts on Free until payments exist.
 */
export function publicPlanLink(plan: Plan): { href: string; label: string } {
  return plan === 'free'
    ? { href: '/register', label: 'Start free' }
    : { href: `/register?plan=${plan}`, label: `Start with ${PLAN_LABEL[plan]}` }
}
