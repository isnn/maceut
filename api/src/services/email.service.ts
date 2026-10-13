import { config } from '../config/env'
import { getEmailProvider, type EmailMessage } from '../lib/email'
import * as notificationRepo from '../repositories/notification.repository'
import * as userRepo from '../repositories/user.repository'

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

interface OtpCopy {
  subject: string
  /** What the code is for, after "Gunakan kode verifikasi (OTP) di bawah untuk" / "Use the verification code (OTP) above to". */
  idFor: string
  enFor: string
  idIgnore: string
  enIgnore: string
}

/**
 * Indonesian first, English second (owner, 2026-10-13), each language in its own block,
 * never both on one line; the footer is English. The subject and the text around the
 * code name it an OTP / verification code next to one lone number: the wording Gmail
 * reads to offer its "Copy code" chip. The code itself never goes in the subject.
 */
const COPY: Record<OtpPurpose, OtpCopy> = {
  'email-verification': {
    subject: 'Kode verifikasi Maceut (OTP)',
    idFor: 'menyelesaikan pendaftaran akun Maceut Anda',
    enFor: 'finish creating your Maceut account',
    idIgnore: 'Bukan Anda yang mendaftar? Abaikan email ini.',
    enIgnore: "Didn't sign up? You can ignore this email.",
  },
  'forget-password': {
    subject: 'Kode reset kata sandi Maceut (OTP)',
    idFor: 'mengatur ulang kata sandi akun Maceut Anda',
    enFor: 'reset the password of your Maceut account',
    idIgnore: 'Tidak meminta reset? Abaikan email ini, kata sandi Anda tidak berubah.',
    enIgnore: "Didn't ask for a reset? Ignore this email, your password hasn't changed.",
  },
  // Not offered in the app today (sign-in is by password); kept so an unexpected type
  // still produces a sensible email rather than an exception.
  'sign-in': {
    subject: 'Kode masuk Maceut (OTP)',
    idFor: 'masuk ke Maceut',
    enFor: 'sign in to Maceut',
    idIgnore: 'Bukan Anda yang mencoba masuk? Abaikan email ini.',
    enIgnore: "Didn't try to sign in? You can ignore this email.",
  },
  'change-email': {
    subject: 'Kode konfirmasi email baru Maceut (OTP)',
    idFor: 'mengonfirmasi alamat email baru akun Maceut Anda',
    enFor: 'confirm this new address for your Maceut account',
    idIgnore: 'Tidak meminta perubahan ini? Abaikan email ini.',
    enIgnore: "Didn't ask for this change? You can ignore this email.",
  },
}

const SUPPORT_EMAIL = 'support.maceut@hokya.dev'
const TAGLINE = 'Connecting people with the road ahead'

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Builds the message; separate from sending so it can be tested without a provider. */
export function otpEmail(
  to: string,
  otp: string,
  purpose: OtpPurpose,
  opts: { name?: string | null; appUrl?: string } = {},
): EmailMessage {
  const copy = COPY[purpose]
  const minutes = Math.round(OTP_EXPIRES_SECONDS / 60)
  const name = opts.name?.trim().split(/\s+/)[0]
  // The web's wordmark as an image (web/public/email): mail clients don't load the brand
  // font, so text would fall back to Arial. The alt text keeps a wordmark when images are off.
  const logoUrl = `${(opts.appUrl ?? config.frontendUrl).replace(/\/$/, '')}/email/maceut-logo.png`

  const id = {
    hi: name ? `Halo ${name},` : 'Halo,',
    lead: `Gunakan kode verifikasi (OTP) di bawah untuk ${copy.idFor}.`,
    expiry: `Kode berlaku ${minutes} menit dan hanya bisa dipakai sekali. Jangan bagikan kode ini kepada siapa pun, termasuk tim Maceut.`,
  }
  const en = {
    hi: name ? `Hi ${name},` : 'Hi,',
    lead: `Use the verification code (OTP) above to ${copy.enFor}.`,
    expiry: `It expires in ${minutes} minutes and works once. Don't share it with anyone, including the Maceut team.`,
  }
  const preheader = 'Kode verifikasi (OTP) Anda untuk Maceut'

  // Email HTML: tables, inline styles and literal colours, because mail clients ignore
  // stylesheets and have never heard of the app's Tailwind tokens. The colours are the
  // app's: ink #1F2330, secondary #5B6170, primary #5A35F3, primary-soft #EEE9FE.
  const p = (text: string, style = '') =>
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#1F2330;${style}">${escapeHtml(text)}</p>`
  const muted = (text: string) => p(text, 'font-size:13px;color:#5B6170;')
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(copy.subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#F5F6F8;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#1F2330">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E4E6EB;border-radius:12px">
    <tr><td style="padding:24px 32px;border-bottom:1px solid #E4E6EB">
      <img src="${logoUrl}" width="92" height="36" alt="maceut" style="display:block;border:0;outline:none;font-size:22px;font-weight:800;color:#1F1F24">
    </td></tr>
    <tr><td style="padding:28px 32px 8px">
      ${p(id.hi)}
      ${p(id.lead)}
      <p style="margin:20px 0 8px;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#5B6170;text-align:center">Kode verifikasi</p>
      <div style="margin:0 0 20px;padding:18px 12px;background:#EEE9FE;border-radius:10px;text-align:center">
        <span style="font-size:34px;font-weight:700;letter-spacing:10px;font-family:Menlo,Consolas,'Courier New',monospace;color:#1F2330">${otp}</span>
      </div>
      ${muted(id.expiry)}
      ${muted(copy.idIgnore)}
    </td></tr>
    <tr><td style="padding:8px 32px 24px">
      <p style="margin:0 0 16px;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#8A8F9C;border-top:1px solid #E4E6EB;padding-top:20px">English</p>
      ${p(en.hi)}
      ${p(en.lead)}
      ${muted(en.expiry)}
      ${muted(copy.enIgnore)}
    </td></tr>
    <tr><td style="padding:20px 32px;background:#FAFAFB;border-top:1px solid #E4E6EB;border-radius:0 0 12px 12px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1F2330">${TAGLINE}</p>
      <p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#5B6170">Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#5A35F3;text-decoration:none">${SUPPORT_EMAIL}</a></p>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#8A8F9C">This is an automated email, please don't reply.</p>
    </td></tr>
  </table>
</body></html>`

  const text = [
    id.hi,
    id.lead,
    '',
    'Kode verifikasi:',
    otp,
    '',
    id.expiry,
    copy.idIgnore,
    '',
    '---- English ----',
    en.hi,
    en.lead,
    en.expiry,
    copy.enIgnore,
    '',
    '--',
    `Maceut · ${TAGLINE}`,
    `Need help? ${SUPPORT_EMAIL}`,
    "This is an automated email, please don't reply.",
    '',
  ].join('\n')

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
  const record = (status: 'sent' | 'failed', error?: string, by: string = provider.name) =>
    (claimedKey
      ? notificationRepo.setEmailOutcome(claimedKey, status, error)
      : notificationRepo.logEmail({ to: message.to, category, status, provider: by, error })
    ).catch(() => undefined)
  try {
    // A fallback chain reports which provider delivered, so the log names Resend when it took over.
    const by = (await provider.send(message)) ?? provider.name
    await record('sent', undefined, by)
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
  // The greeting uses the account's name when there is one; a failed lookup only costs the name.
  const name = await userRepo
    .findByEmail(email)
    .then((u) => u?.name)
    .catch(() => undefined)
  await sendLogged(otpEmail(email, otp, purpose, { name }), purpose)
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
