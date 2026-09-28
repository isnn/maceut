import { getEmailProvider, type EmailMessage } from '../lib/email'

/**
 * What Maceut emails, and what those emails say. Which company delivers them is
 * lib/email's concern (EMAIL_PROVIDER); nothing here knows or cares.
 *
 * Only one kind so far: a one-time code, for verifying a new account's address and
 * for resetting a forgotten password. Both come from Better Auth's email-OTP plugin
 * (lib/auth.ts), which generates, stores (hashed) and checks the code.
 */

/** How long a code stays valid. Better Auth enforces it; the email just says it. */
export const OTP_EXPIRES_SECONDS = 10 * 60

export type OtpPurpose = 'email-verification' | 'forget-password' | 'sign-in' | 'change-email'

const COPY: Record<OtpPurpose, { subject: string; lead: string; ignore: string }> = {
  'email-verification': {
    subject: 'Your Maceut verification code',
    lead: 'Enter this code to verify your email and finish creating your Maceut account.',
    ignore: "If you didn't create a Maceut account, you can ignore this email.",
  },
  'forget-password': {
    subject: 'Your Maceut password reset code',
    lead: 'Enter this code to choose a new password for your Maceut account.',
    ignore: "If you didn't ask to reset your password, you can ignore this email — your password hasn't changed.",
  },
  // Not offered in the app today (sign-in is by password); kept so an unexpected type
  // still produces a sensible email rather than an exception.
  'sign-in': {
    subject: 'Your Maceut sign-in code',
    lead: 'Enter this code to sign in to Maceut.',
    ignore: "If you didn't try to sign in, you can ignore this email.",
  },
  'change-email': {
    subject: 'Confirm your new Maceut email',
    lead: 'Enter this code to confirm this address for your Maceut account.',
    ignore: "If you didn't ask for this change, you can ignore this email.",
  },
}

/** Builds the message; separate from sending so it can be tested without a provider. */
export function otpEmail(to: string, otp: string, purpose: OtpPurpose): EmailMessage {
  const copy = COPY[purpose]
  const minutes = Math.round(OTP_EXPIRES_SECONDS / 60)
  const expiry = `The code expires in ${minutes} minutes and works once.`

  // Email HTML: inline styles and literal colours, because mail clients ignore
  // stylesheets and have never heard of the app's Tailwind tokens.
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2330">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e6eb;border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;font-size:18px;font-weight:700">Maceut</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${copy.lead}</p>
      <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:Menlo,Consolas,monospace">${otp}</p>
      <p style="margin:0 0 24px;font-size:13px;color:#5b6170">${expiry}</p>
      <p style="margin:0;font-size:13px;color:#5b6170">${copy.ignore}</p>
    </td></tr>
  </table>
</body></html>`

  const text = `${copy.lead}\n\n${otp}\n\n${expiry}\n\n${copy.ignore}\n`

  return { to, subject: copy.subject, html, text, category: purpose }
}

/**
 * Sends a one-time code. Better Auth's hook for the email-OTP plugin.
 *
 * Failures are logged, not thrown. Better Auth answers these requests the same way
 * whether or not the address exists (so the form can't be used to discover accounts),
 * and an exception here would break that; the user simply asks for another code.
 */
export async function sendOtpEmail(email: string, otp: string, purpose: OtpPurpose): Promise<void> {
  try {
    await getEmailProvider().send(otpEmail(email, otp, purpose))
  } catch (err) {
    console.error(`[email] ${purpose} code to ${email} not sent:`, err instanceof Error ? err.message : err)
  }
}
