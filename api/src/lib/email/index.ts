import { config, type Config } from '../../config/env'
import { createConsoleProvider } from './console.provider'
import { createMailtrapProvider } from './mailtrap.provider'
import { createResendProvider } from './resend.provider'
import type { EmailProvider } from './types'

export type { EmailMessage, EmailProvider } from './types'
export { EmailSendError } from './types'

/**
 * Picks the provider EMAIL_PROVIDER names. Config validation has already guaranteed
 * the chosen provider has its credential, so the `!` below cannot be reached unset.
 */
export function createEmailProvider(c: Pick<Config, 'emailProvider' | 'emailFrom' | 'resendApiKey' | 'mailtrapApiToken' | 'mailtrapInboxId'>): EmailProvider {
  switch (c.emailProvider) {
    case 'resend':
      return createResendProvider({ apiKey: c.resendApiKey!, from: c.emailFrom })
    case 'mailtrap':
      return createMailtrapProvider({ apiToken: c.mailtrapApiToken!, from: c.emailFrom, inboxId: c.mailtrapInboxId })
    case 'console':
      return createConsoleProvider()
  }
}

let provider: EmailProvider | null = null

/** The process's provider, built on first use. */
export function getEmailProvider(): EmailProvider {
  provider ??= createEmailProvider(config)
  return provider
}
