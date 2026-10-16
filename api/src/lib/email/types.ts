/**
 * The one shape every email provider speaks (lib/email).
 *
 * Callers build an `EmailMessage` and hand it to `getEmailProvider().send()`; which
 * company delivers it is EMAIL_PROVIDER's business, not theirs. Adding a provider is a
 * new file implementing `EmailProvider` plus one line in `index.ts` — nothing that sends
 * mail changes.
 */

export interface EmailMessage {
  to: string
  subject: string
  /** Both bodies, always: some clients (and spam filters) read only the plain part. */
  html: string
  text: string
  /** Groups messages in the provider's dashboard, e.g. `email-verification`. */
  category?: string
  /**
   * Images carried inside the message and shown by `cid:<contentId>` in the HTML. Unlike
   * a hosted URL they show in every inbox and in the Mailtrap sandbox, and they don't
   * depend on the web being reachable.
   */
  inline?: InlineImage[]
}

export interface InlineImage {
  contentId: string
  filename: string
  contentType: string
  /** Base64. */
  content: string
}

export interface EmailProvider {
  readonly name: 'console' | 'resend' | 'mailtrap'
  /**
   * Resolves once a provider accepted the message; throws `EmailSendError` if not.
   * A fallback chain resolves with the name of the provider that actually delivered.
   */
  send(message: EmailMessage): Promise<EmailProvider['name'] | void>
}

/** A provider refused or could not be reached. `status` is the HTTP status, if any. */
export class EmailSendError extends Error {
  constructor(
    readonly provider: EmailProvider['name'],
    message: string,
    readonly status?: number,
  ) {
    super(`[${provider}] ${message}`)
    this.name = 'EmailSendError'
  }
}

/** `"Maceut <no-reply@maceut.id>"` → `{ name: 'Maceut', email: 'no-reply@maceut.id' }`. */
export function parseAddress(from: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/.exec(from)
  if (!match) return { email: from.trim() }
  const name = match[1]!.replace(/^"|"$/g, '').trim()
  return name ? { name, email: match[2]! } : { email: match[2]! }
}
