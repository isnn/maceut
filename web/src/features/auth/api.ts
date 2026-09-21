/**
 * Auth, against the real backend.
 *
 * Sign-up, sign-in and sign-out are Better Auth's, under `/api/auth/*`, and answer in
 * its response shape (ADR-016). Everything about a user that Better Auth does not
 * know — plan, platform role, onboarding state — comes from `GET /me` in this API's
 * `{ success, data }` envelope. That is why register() and login() each make two
 * calls: authenticate, then load the application's view of the account.
 *
 * The session is an HttpOnly cookie, so nothing here stores a token and nothing on
 * this page can read one. There is no longer a localStorage fallback: if the API is
 * unreachable, calls fail loudly rather than quietly serving stale local state.
 */

import type { LoginInput, Plan, RegisterInput, User } from './types'
import { ApiError } from '@/types/api'
import { apiClient, authRequest } from '@/lib/api-client'

export async function register(input: RegisterInput): Promise<User> {
  await authRequest<unknown>('/sign-up/email', {
    email: input.email,
    password: input.password,
    // Better Auth's field is `name`; every screen here calls it fullName.
    name: input.fullName,
  })

  // Better Auth signs the user in on sign-up (autoSignIn), so the cookie is already
  // set and this call is authenticated.
  const user = await getMe()
  if (!user) throw new ApiError({ code: 'UNAUTHORIZED', message: 'Signed up, but the session did not start. Please log in.' })
  return user
}

export async function login(input: LoginInput): Promise<User> {
  await authRequest<unknown>('/sign-in/email', { email: input.email, password: input.password })

  const user = await getMe()
  if (!user) throw new ApiError({ code: 'UNAUTHORIZED', message: 'Signed in, but the session did not start. Please try again.' })
  return user
}

export async function logout(): Promise<void> {
  try {
    await authRequest<unknown>('/sign-out')
  } catch {
    // Never block the redirect to /login. If the call failed the cookie may still be
    // set, but leaving the user stuck on a page they think they left is worse — and
    // the next request will 401 and bounce them here anyway.
  }
}

/**
 * The signed-in user, or null when there is no session.
 *
 * A 401 is the ordinary signed-out answer, not an error to surface — every guard in
 * the app calls this on mount. Anything else (network down, 500) is rethrown, so a
 * broken backend does not masquerade as "logged out" and silently redirect.
 */
export async function getMe(): Promise<User | null> {
  try {
    return await apiClient.get<User>('/me')
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UNAUTHORIZED') return null
    throw err
  }
}

/** Step 2 of sign-up (3p): choose a plan and finish onboarding. */
/**
 * Marks sign-up finished. No plan argument: every account starts on Free.
 *
 * The onboarding step used to sell a plan, which meant a brand-new account could award
 * itself Premium limits without paying anything. Staff grant paid plans instead.
 */
export async function completeOnboarding(): Promise<User> {
  return apiClient.post<User>('/me/onboarding', {})
}

/**
 * Plan switch on Profile & usage (3o) — downgrades only.
 *
 * The server refuses an upgrade with 403 UPGRADE_NOT_SELF_SERVE until billing exists,
 * because gaining capacity nobody paid for is not something an account should be able
 * to do to itself. Downgrading stays self-serve and runs the full grandfather-and-block
 * pass (ADR-020).
 */
export async function updatePlan(plan: Plan): Promise<User> {
  return apiClient.patch<User>('/me/plan', { plan })
}
