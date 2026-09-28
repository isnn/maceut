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

/**
 * Creates the account. Returns no user: there is no session until the address is
 * verified with the emailed code (`verifyEmail`), so the caller moves on to the code
 * screen.
 *
 * An address that already has an account gets the same answer as a new one — Better
 * Auth won't say "email taken", so sign-up can't be used to find out who has an
 * account. That account's owner simply receives no code; the code screen says so.
 */
export async function register(input: RegisterInput): Promise<void> {
  await authRequest<unknown>('/sign-up/email', {
    email: input.email,
    password: input.password,
    // Better Auth's field is `name`; every screen here calls it fullName.
    name: input.fullName,
  })
}

/** The error code a sign-in to an unverified account fails with. A new code is already on its way. */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED'

export async function login(input: LoginInput): Promise<User> {
  await authRequest<unknown>('/sign-in/email', { email: input.email, password: input.password })

  const user = await getMe()
  if (!user) throw new ApiError({ code: 'UNAUTHORIZED', message: 'Signed in, but the session did not start. Please try again.' })
  return user
}

// --- One-time codes by email ------------------------------------------------------

/**
 * Better Auth's code errors in words a person can act on. Its own messages ("Invalid
 * OTP") name the mechanism, not what to do next.
 */
const OTP_MESSAGE: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check the most recent email — only the latest code works.",
  OTP_EXPIRED: 'That code has expired. Send a new one.',
  TOO_MANY_ATTEMPTS: 'Too many wrong tries for this code. Send a new one.',
}

async function otpRequest<T>(path: string, payload: unknown): Promise<T> {
  try {
    return await authRequest<T>(path, payload)
  } catch (err) {
    if (err instanceof ApiError && OTP_MESSAGE[err.code]) {
      throw new ApiError({ code: err.code, message: OTP_MESSAGE[err.code]! })
    }
    throw err
  }
}

/** Verifies the address with its code. Right code → signed in, and the user is returned. */
export async function verifyEmail(email: string, otp: string): Promise<User> {
  await otpRequest<unknown>('/email-otp/verify-email', { email, otp })
  const user = await getMe()
  if (!user) throw new ApiError({ code: 'UNAUTHORIZED', message: 'Your email is verified. Please log in.' })
  return user
}

/** Sends a fresh verification code; the previous one stops working. */
export async function resendVerificationCode(email: string): Promise<void> {
  await otpRequest<unknown>('/email-otp/send-verification-otp', { email, type: 'email-verification' })
}

/** Emails a reset code — if the address has an account. The answer is the same either way. */
export async function requestPasswordReset(email: string): Promise<void> {
  await otpRequest<unknown>('/email-otp/request-password-reset', { email })
}

/** Sets a new password with the emailed code. Doesn't sign in: the next step is logging in. */
export async function resetPassword(email: string, otp: string, password: string): Promise<void> {
  await otpRequest<unknown>('/email-otp/reset-password', { email, otp, password })
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
