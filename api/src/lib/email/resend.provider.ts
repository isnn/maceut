import { EmailSendError, type EmailMessage, type EmailProvider } from './types'

const RESEND_URL = 'https://api.resend.com/emails'

/**
 * Resend's REST API, over plain fetch — one POST does not justify their SDK.
 * https://resend.com/docs/api-reference/emails/send-email
 */
export function createResendProvider(opts: { apiKey: string; from: string; fetch?: typeof fetch }): EmailProvider {
  const doFetch = opts.fetch ?? fetch
  return {
    name: 'resend',
    async send(message: EmailMessage) {
      let res: Response
      try {
        res = await doFetch(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: opts.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.category ? { tags: [{ name: 'category', value: message.category.replace(/[^\w-]/g, '_') }] } : {}),
          }),
        })
      } catch (err) {
        throw new EmailSendError('resend', `unreachable: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new EmailSendError('resend', body?.message ?? `HTTP ${res.status}`, res.status)
      }
    },
  }
}
