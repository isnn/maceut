import { Logo } from '@/components/ui/Logo'

const LINKS = [
  { href: '/#product', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/terms', label: 'Terms of Service' },
]

/** Footer for the public pages (FE-37): only pages that exist. */
export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1600px] px-lg tablet:px-xl py-xl flex flex-wrap items-center justify-between gap-lg">
        <Logo />
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-xl gap-y-sm">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="inline-flex items-center min-h-11 text-body text-text-secondary no-underline hover:text-text-primary transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <p className="w-full text-caption text-text-secondary">© 2026 Maceut</p>
      </div>
    </footer>
  )
}
