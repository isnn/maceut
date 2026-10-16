import type { Metadata } from 'next'
import { LegalPage, langFrom } from '@/features/legal/LegalPage'
import { PRIVACY } from '@/features/legal/texts'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What personal data Maceut collects, why, who receives it and how long it is kept.',
}

/** Privacy Policy (H3), verbatim from features/legal/texts.ts; `?lang=id` for Indonesian. */
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams
  return <LegalPage path="/privacy" lang={langFrom(lang)} texts={PRIVACY} />
}
