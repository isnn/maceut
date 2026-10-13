import { config, type Config } from '../../config/env'
import { createConsoleProvider } from './console.provider'
import { createFallbackProvider } from './fallback.provider'
import { createMailtrapProvider } from './mailtrap.provider'
import { createResendProvider } from './resend.provider'
import type { EmailProvider } from './types'

export type { EmailMessage, EmailProvider, InlineImage } from './types'
export { EmailSendError } from './types'

/**
 * Builds the providers config resolved from EMAIL_PROVIDER, in order. With two (auto
 * mode, both keys set) Mailtrap sends and Resend takes over when it fails. Config
 * validation has already guaranteed each listed provider has its credential, so the
 * `!` below cannot be reached unset.
 */
export function createEmailProvider(c: Pick<Config, 'emailProviders' | 'emailFrom' | 'resendApiKey' | 'mailtrapApiToken' | 'mailtrapInboxId'>): EmailProvider {
  return createFallbackProvider(
    c.emailProviders.map((name) => {
      switch (name) {
        case 'resend':
          return createResendProvider({ apiKey: c.resendApiKey!, from: c.emailFrom })
        case 'mailtrap':
          return createMailtrapProvider({ apiToken: c.mailtrapApiToken!, from: c.emailFrom, inboxId: c.mailtrapInboxId })
        case 'console':
          return createConsoleProvider()
      }
    }),
  )
}

let provider: EmailProvider | null = null

/** The process's provider, built on first use. */
export function getEmailProvider(): EmailProvider {
  provider ??= createEmailProvider(config)
  return provider
}
