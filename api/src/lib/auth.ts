import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './drizzle-client'
import * as schema from '../../drizzle/schema'
import { config } from '../config/env'
import { expiryToSeconds } from './duration'

/**
 * Better Auth owns the auth module (ADR-009).
 *
 * It mounts its own handler under `/api/auth/*` and answers in its own response
 * shapes — deliberately. Everything else in this API keeps the `{ success, data }`
 * envelope; the two never meet because they are separate route subtrees, and our
 * middleware only asks Better Auth for the current session.
 *
 * Sessions are rows in the `session` table, not stateless tokens, so signing out
 * actually revokes. That closes the trade-off ADR-009 itself flagged ("perlu session
 * store/blacklist saat logout").
 */
export const auth = betterAuth({
  // The schema has to be handed over explicitly: `drizzle(pool)` carries none, so
  // without this the adapter reports every one of its tables as missing at startup.
  database: drizzleAdapter(db, { provider: 'pg', schema }),

  // Reuses JWT_SECRET rather than introducing a second secret to rotate. The name is
  // now slightly narrow — it signs sessions, not JWTs — but the rotate warning on it
  // ("signs out every user") is exactly as true as before.
  secret: config.jwtSecret,
  baseURL: config.appBaseUrl,
  basePath: '/api/auth',

  // Only the browser origin. RENDER_BASE_URL is an internal address Playwright uses
  // and must never be trusted as an auth origin (ADR-017).
  trustedOrigins: [config.frontendUrl],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8, // F-08.
    // Better Auth hashes with scrypt, which has no input-length limit — so unlike
    // bcrypt's 72 bytes this is policy, not a technical ceiling. It exists only so a
    // megabyte-long password cannot burn CPU in the KDF, and is set well clear of any
    // real passphrase.
    maxPasswordLength: 128,
    autoSignIn: true, // F-08: registering signs you in.
  },

  session: {
    expiresIn: expiryToSeconds(config.jwtExpiry),
  },

  user: {
    additionalFields: {
      organisation: {
        type: 'string',
        required: false,
      },
      /**
       * Platform role (BR-027). `input: false` means a client cannot send it — without
       * that, anyone could register themselves as staff by adding one field to the
       * sign-up body. The value here is a cache; `resolveRole()` against
       * INTERNAL_EMAILS is the authority on every request.
       */
      role: {
        type: 'string',
        required: false,
        defaultValue: 'user',
        input: false,
      },
      /** Whether the plan-picking step after sign-up is done. Server-set only. */
      onboardingDone: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },

  advanced: {
    cookiePrefix: 'maceut',
    useSecureCookies: config.cookieSecure,
  },
})

export type Session = typeof auth.$Infer.Session
