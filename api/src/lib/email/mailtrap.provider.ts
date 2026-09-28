import { EmailSendError, parseAddress, type EmailMessage, type EmailProvider } from './types'

/**
 * Mailtrap's Email API, over plain fetch.
 *
 * With `inboxId` it sends to a Mailtrap *sandbox* inbox — nothing reaches a real
 * mailbox, which is what you want in staging. Without it, it sends for real.
 * https://api-docs.mailtrap.io/docs/mailtrap-api-docs/
 */
export function createMailtrapProvider(opts: {
  apiToken: string
  from: string
  inboxId?: string
  fetch?: typeof fetch
}): EmailProvider {
  const doFetch = opts.fetch ?? fetch
  const url = opts.inboxId
    ? `https://sandbox.api.mailtrap.io/api/send/${encodeURIComponent(opts.inboxId)}`
    : 'https://send.api.mailtrap.io/api/send'
  const from = parseAddress(opts.from)

  return {
    name: 'mailtrap',
    async send(message: EmailMessage) {
      let res: Response
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [{ email: message.to }],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.category ? { category: message.category } : {}),
          }),
        })
      } catch (err) {
        throw new EmailSendError('mailtrap', `unreachable: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { errors?: string[]; error?: string } | null
        throw new EmailSendError('mailtrap', body?.errors?.join('; ') ?? body?.error ?? `HTTP ${res.status}`, res.status)
      }
    },
  }
}
