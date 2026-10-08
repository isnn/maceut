import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './drizzle-client'
import * as schema from '../../drizzle/schema'
import { config } from '../config/env'
import { expiryToSeconds } from './duration'
import { OTP_EXPIRES_SECONDS, sendOtpEmail } from '../services/email.service'

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
    // No session until the address is verified with the emailed code. Sign-up answers
    // with no session (Better Auth skips autoSignIn under this flag), and a password
    // sign-in to an unverified account is refused with 403 EMAIL_NOT_VERIFIED.
    //
    // Side effect, deliberate: sign-up with an address that already exists answers
    // exactly like a fresh one (no "email taken"), so the form can't be used to find
    // out who has an account.
    requireEmailVerification: true,
  },

  emailVerification: {
    // Refused sign-in of an unverified account sends a fresh code, so the verify
    // screen it lands on already has one on the way.
    sendOnSignIn: true,
    // Entering the right code signs the user in — registering still ends signed in.
    autoSignInAfterVerification: true,
  },

  plugins: [
    // One-time codes by email (lib/email → EMAIL_PROVIDER), for verifying a new
    // address and for resetting a forgotten password. Codes, not links: they survive
    // mail scanners that pre-open links, and work when the email is read on a phone
    // but the app is open on a laptop.
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_EXPIRES_SECONDS,
      allowedAttempts: 5,
      // Encrypted with the auth secret — a database read alone doesn't hand out working
      // codes. Not hashed, because `reuse` below needs to send the same code again.
      storeOTP: 'encrypted',
      // "Send a new code" while one is still valid re-sends THAT code (fresh expiry)
      // instead of rotating it, so an email arriving late still works and the user
      // isn't left guessing which of three codes is the live one.
      resendStrategy: 'reuse',
      // Replaces Better Auth's link-based verification email with a code, including
      // the one sent on sign-up and on a refused sign-in.
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      // Not awaited: whether a send happens (it doesn't for an unknown address on
      // password reset) must not show up in the response time.
      async sendVerificationOTP({ email, otp, type }) {
        void sendOtpEmail(email, otp, type)
      },
    }),
  ],

  session: {
    expiresIn: expiryToSeconds(config.jwtExpiry),
  },

  user: {
    additionalFields: {
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
