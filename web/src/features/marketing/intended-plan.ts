import type { Plan } from '@/features/auth/types'

/**
 * The paid plan a visitor picked on the pricing page before signing up (FE-37).
 *
 * Every account starts on Free (BR-001) and upgrades are not self-serve until payments
 * exist, so the choice is only remembered: it survives email verification and
 * onboarding in sessionStorage, then opens the Profile plan picker on that plan. When a
 * payment gateway lands, that picker step becomes checkout.
 */
const KEY = 'maceut.intendedPlan'

export function isPaidPlan(value: unknown): value is Exclude<Plan, 'free'> {
  return value === 'standard' || value === 'premium'
}

export function rememberIntendedPlan(plan: Plan): void {
  try {
    if (isPaidPlan(plan)) sessionStorage.setItem(KEY, plan)
  } catch {
    // Storage unavailable (private mode): the visitor just starts on Free.
  }
}

export function peekIntendedPlan(): Exclude<Plan, 'free'> | null {
  try {
    const v = sessionStorage.getItem(KEY)
    return isPaidPlan(v) ? v : null
  } catch {
    return null
  }
}

export function forgetIntendedPlan(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing kept.
  }
}

/** `?plan=` from the current URL, when it names a paid plan. Client only. */
export function planFromUrl(): Exclude<Plan, 'free'> | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('plan')
  return isPaidPlan(v) ? v : null
}
