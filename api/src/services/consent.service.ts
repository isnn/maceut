import { LEGAL_VERSION } from '../types/legal'

/**
 * Consent at sign-up (H4). The register form sends `acceptTerms: true` and the
 * `consentVersion` it showed (not `termsVersion`: that is the stored, server-only
 * column, and Better Auth refuses a body field with its name); the server checks both, so a request that skips the form
 * cannot create an account without agreeing. Better Auth calls these from lib/auth.ts.
 */

export const TERMS_NOT_ACCEPTED = 'TERMS_NOT_ACCEPTED'

/** Why a sign-up body does not show consent to the current texts, or null when it does. */
export function consentProblem(body: unknown): string | null {
  const b = (body ?? {}) as { acceptTerms?: unknown; consentVersion?: unknown }
  if (b.acceptTerms !== true) return 'Accept the Terms of Service and Privacy Policy to create an account.'
  if (b.consentVersion !== LEGAL_VERSION) return 'The Terms of Service have changed. Reload the page and accept the current version.'
  return null
}

/** What is stored on the new user row as proof: when, and which version. */
export function consentStamp(now: Date = new Date()): { termsAcceptedAt: Date; termsVersion: string } {
  return { termsAcceptedAt: now, termsVersion: LEGAL_VERSION }
}
