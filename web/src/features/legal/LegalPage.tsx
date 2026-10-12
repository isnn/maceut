import Link from 'next/link'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { PublicFooter } from '@/components/shared/PublicFooter'
import { Alert } from '@/components/ui/Alert'
import { cn } from '@/lib/utils'
import { LegalDocument, legalTitle } from './LegalDocument'
import type { LegalLang } from './texts'

const DRAFT_NOTE: Record<LegalLang, string> = {
  en: 'Draft: not yet reviewed by a lawyer. The Indonesian version prevails if the two differ.',
  id: 'Draf: belum ditinjau oleh pengacara. Jika terdapat perbedaan, versi bahasa Indonesia yang berlaku.',
}

/** `?lang=id` picks Indonesian; anything else is English. */
export function langFrom(value: string | string[] | undefined): LegalLang {
  return value === 'id' ? 'id' : 'en'
}

/** Terms and Privacy share one layout: title, language switch, draft note, the text. */
export function LegalPage({ path, lang, texts }: { path: string; lang: LegalLang; texts: Record<LegalLang, string> }) {
  const source = texts[lang]
  return (
    <>
      <PublicHeader />
      <main className="flex-1">
        <article lang={lang} className="mx-auto max-w-[46rem] px-lg tablet:px-xl py-section">
          <div className="flex flex-wrap items-start justify-between gap-md">
            <h1 className="text-[36px] leading-[1.1] font-extrabold tracking-tight text-text-primary text-balance">
              {legalTitle(source)}
            </h1>
            <nav aria-label="Language" className="inline-flex rounded-full border border-border p-[3px]">
              {(['en', 'id'] as const).map((l) => (
                <Link
                  key={l}
                  href={l === 'en' ? path : `${path}?lang=id`}
                  aria-current={l === lang ? 'page' : undefined}
                  className={cn(
                    'min-h-9 px-md inline-flex items-center rounded-full text-label font-semibold no-underline',
                    l === lang ? 'bg-text-primary text-on-primary' : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {l === 'en' ? 'English' : 'Bahasa Indonesia'}
                </Link>
              ))}
            </nav>
          </div>
          <Alert variant="info" className="mt-lg">
            {DRAFT_NOTE[lang]}
          </Alert>
          <div className="mt-xl">
            <LegalDocument source={source} />
          </div>
        </article>
      </main>
      <PublicFooter />
    </>
  )
}
