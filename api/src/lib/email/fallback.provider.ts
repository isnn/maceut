import { EmailSendError, type EmailMessage, type EmailProvider } from './types'

/**
 * Tries each provider in order and stops at the first that accepts the message: Mailtrap
 * first, Resend when Mailtrap refuses (quota spent, token revoked) or cannot be reached.
 * Any failure moves on, since a refused send is a code that never arrives either way.
 * Throws only when every provider failed, with all their reasons.
 */
export function createFallbackProvider(
  providers: EmailProvider[],
  warn: (line: string) => void = console.warn,
): EmailProvider {
  const [first] = providers
  if (!first) throw new Error('createFallbackProvider needs at least one provider')
  if (providers.length === 1) return first

  return {
    name: first.name,
    async send(message: EmailMessage) {
      const errors: string[] = []
      for (const [i, p] of providers.entries()) {
        try {
          await p.send(message)
          return p.name
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          errors.push(reason)
          const next = providers[i + 1]
          if (next) warn(`[email] ${p.name} failed (${reason}), trying ${next.name}`)
        }
      }
      throw new EmailSendError(first.name, `all providers failed: ${errors.join(' | ')}`)
    },
  }
}
