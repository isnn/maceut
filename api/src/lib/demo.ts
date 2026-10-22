import { config } from '../config/env'

/**
 * The shared demo account (DEMO_ENABLED). Everyone signs in to it with the same password,
 * so whatever one visitor changes about the account itself — its password, email, plan,
 * or a payment — would land on every other visitor. Those are refused for it; using the
 * product (zones, schedules, Studio, exports) is not. Off, no account is the demo.
 */
export function isDemoUser(email: string | null | undefined): boolean {
  return config.demoEnabled && !!email && email.trim().toLowerCase() === config.demoEmail
}

/**
 * Better Auth endpoints refused for the demo: with one password shared by every
 * visitor, any of these would lock the others out, sign them out, or send codes to an
 * inbox nobody reads. Identified by the session…
 */
export const DEMO_LOCKED_SESSION_PATHS = new Set([
  '/change-password',
  '/change-email',
  '/delete-user',
  '/email-otp/change-email',
  '/email-otp/request-email-change',
  '/revoke-sessions',
  '/revoke-other-sessions',
])

/** …or by the address in the body, for the signed-out flows. */
export const DEMO_LOCKED_EMAIL_PATHS = new Set([
  '/sign-up/email',
  '/request-password-reset',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/email-otp/reset-password',
  '/email-otp/send-verification-otp',
  '/send-verification-email',
])

/**
 * Whether a browser call to a Better Auth endpoint touches the demo account and must be
 * refused (auth.ts `hooks.before`). The session is looked up only for the paths that
 * need it, so every other request costs nothing.
 */
export async function demoLocked(
  path: string,
  body: unknown,
  sessionEmail: () => Promise<string | undefined>,
): Promise<boolean> {
  if (!config.demoEnabled) return false
  if (DEMO_LOCKED_EMAIL_PATHS.has(path)) return isDemoUser((body as { email?: string } | undefined)?.email)
  if (DEMO_LOCKED_SESSION_PATHS.has(path)) return isDemoUser(await sessionEmail())
  return false
}
