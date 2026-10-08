import type { EmailMessage, EmailProvider } from './types'

/**
 * Prints the message instead of sending it — the development default, so a fresh
 * `docker compose up` can register accounts without an email account. The code is in
 * `docker compose logs api`. Refused in production by config validation.
 */
export function createConsoleProvider(log: (line: string) => void = console.log): EmailProvider {
  return {
    name: 'console',
    async send(message: EmailMessage) {
      log(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}`)
    },
  }
}
