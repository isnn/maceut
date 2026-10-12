import type { Metadata } from 'next'
import { LegalPage, langFrom } from '@/features/legal/LegalPage'
import { TERMS } from '@/features/legal/texts'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using Maceut, in English and Indonesian.',
}

/**
 * Terms of Service (H2). The text is the owner's final draft, verbatim (features/legal/
 * texts.ts); `?lang=id` shows the Indonesian version, which prevails (§14).
 */
export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams
  return <LegalPage path="/terms" lang={langFrom(lang)} texts={TERMS} />
}
