import { config } from '../config/env'
import { getEmailProvider, type EmailMessage } from '../lib/email'
import * as notificationRepo from '../repositories/notification.repository'

/**
 * What Maceut emails, and what those emails say. Which company delivers them is
 * lib/email's concern (EMAIL_PROVIDER); nothing here knows or cares.
 *
 * Email costs money per message, so the platform sends few (NOTIF):
 *
 * - one-time codes — verifying a new address, resetting a password (Better Auth's
 *   email-OTP plugin, lib/auth.ts), with per-address send limits;
 * - "captures keep failing" — at most one per user per day, after a delay
 *   (notification.service's email sweep);
 * - a plan change made by staff;
 * - HERE budget alerts, to one staff address.
 *
 * Every attempt goes through `sendLogged`, which writes `email_log`: the cost meter,
 * and what the limits count.
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
 * Sends and records one email. Returns whether the provider accepted it; never throws
 * — a notification or code that fails to send must not fail the request behind it.
 *
 * `claimedKey`: the send was already claimed in email_log by that dedupe key (a
 * one-time alert); its row gets the outcome instead of a second row being written, so
 * the log counts each email once.
 */
export async function sendLogged(message: EmailMessage, category: string, claimedKey?: string): Promise<boolean> {
  const provider = getEmailProvider()
  const record = (status: 'sent' | 'failed', error?: string) =>
    (claimedKey
      ? notificationRepo.setEmailOutcome(claimedKey, status, error)
      : notificationRepo.logEmail({ to: message.to, category, status, provider: provider.name, error })
    ).catch(() => undefined)
  try {
    await provider.send(message)
    await record('sent')
    return true
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[email] ${category} to ${message.to} not sent:`, error)
    await record('failed', error.slice(0, 500))
    return false
  }
}

/**
 * Codes per address. Protects the bill and the recipient: without a server-side cap,
 * anyone can type a victim's address into "send a new code" and have us mail them all
 * day. The 30-second button cooldown is only a browser nicety.
 */
export const OTP_SEND_LIMITS = [
  { windowMs: 10 * 60 * 1000, max: 3 },
  { windowMs: 24 * 60 * 60 * 1000, max: 10 },
] as const

/**
 * Sends a one-time code. Better Auth's hook for the email-OTP plugin.
 *
 * Over a limit, nothing is sent and the attempt is logged as `suppressed`. The request
 * still answers as usual — Better Auth answers the same whether or not an address
 * exists, and a distinct "too many" answer here would leak that. The user already has
 * a working code from the previous send (codes are re-sent, not rotated; lib/auth.ts).
 */
export async function sendOtpEmail(email: string, otp: string, purpose: OtpPurpose, now: Date = new Date()): Promise<void> {
  try {
    for (const limit of OTP_SEND_LIMITS) {
      const sent = await notificationRepo.countSent(email, purpose, new Date(now.getTime() - limit.windowMs))
      if (sent >= limit.max) {
        await notificationRepo.logEmail({ to: email, category: purpose, status: 'suppressed', provider: getEmailProvider().name })
        console.warn(`[email] ${purpose} code to ${email} suppressed — ${sent} sent in the last ${limit.windowMs / 60000} min`)
        return
      }
    }
  } catch (err) {
    // The limit is protection, not a gate: if it can't be checked, still send.
    console.error('[email] OTP limit check failed:', err instanceof Error ? err.message : err)
  }
  await sendLogged(otpEmail(email, otp, purpose), purpose)
}

// --- notification emails ---------------------------------------------------------------

/** The frame every notification email shares: heading, paragraphs, one button, and why you got it. */
function layout(opts: { heading: string; paragraphs: string[]; button?: { label: string; href: string }; footer: string }): {
  html: string
  text: string
} {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2330">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e6eb;border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;font-size:18px;font-weight:700">Maceut</p>
      <p style="margin:0 0 16px;font-size:17px;font-weight:600">${esc(opts.heading)}</p>
      ${opts.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${esc(p)}</p>`).join('\n      ')}
      ${
        opts.button
          ? `<p style="margin:24px 0"><a href="${opts.button.href}" style="display:inline-block;background:#5a35f3;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">${esc(opts.button.label)}</a></p>`
          : ''
      }
      <p style="margin:24px 0 0;font-size:12px;color:#5b6170">${esc(opts.footer)}</p>
    </td></tr>
  </table>
</body></html>`
  const text = [opts.heading, '', ...opts.paragraphs, ...(opts.button ? ['', `${opts.button.label}: ${opts.button.href}`] : []), '', opts.footer, ''].join('\n')
  return { html, text }
}

const appUrl = (path: string) => `${config.frontendUrl}${path}`

export interface FailingZone {
  zoneId: string
  zoneName: string
  /** When scheduled collection started failing. */
  since: Date
  error: string | null
}

/** "Captures keep failing" — every still-failing zone of one user, in one email. */
export function captureProblemsEmail(to: string, zones: FailingZone[]): EmailMessage {
  const wib = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d) + ' WIB'
  const single = zones.length === 1
  const heading = single ? `${zones[0]!.zoneName} has stopped collecting traffic` : `${zones.length} zones have stopped collecting traffic`
  const lines = zones.map((z) => `• ${z.zoneName} — failing since ${wib(z.since)}${z.error ? ` (${z.error})` : ''}`)
  const { html, text } = layout({
    heading,
    paragraphs: [
      ...lines,
      'We keep retrying at every scheduled time, and collection resumes on its own once the cause clears. Frames missed in the meantime cannot be recovered.',
      'If it keeps failing, check the zone page for the latest error.',
    ],
    button: { label: single ? 'Open the zone' : 'Open your zones', href: appUrl(single ? `/zones/${zones[0]!.zoneId}` : '/zones') },
    footer: 'You get at most one of these a day. Turn them off in Profile → Notifications.',
  })
  return { to, subject: heading, html, text, category: 'capture-problems' }
}

/** A plan change made by staff (a customer changing their own plan is already in the app). */
export function planChangedEmail(to: string, opts: { title: string; body: string }): EmailMessage {
  const { html, text } = layout({
    heading: opts.title,
    paragraphs: [opts.body],
    button: { label: 'See your plan', href: appUrl('/profile') },
    footer: 'This is an account notice about your Maceut plan.',
  })
  return { to, subject: opts.title, html, text, category: 'plan-changed' }
}

/** HERE budget alert, to the one address staff set on the HERE page. */
export function hereBudgetEmail(to: string, opts: { title: string; body: string }): EmailMessage {
  const { html, text } = layout({
    heading: opts.title,
    paragraphs: [opts.body],
    button: { label: 'Open HERE usage', href: appUrl('/internal/here') },
    footer: 'Sent to the alert address set on the HERE usage page. Change it there.',
  })
  return { to, subject: `[Maceut] ${opts.title}`, html, text, category: 'here-budget' }
}
