import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { buttonClass } from '@/components/ui/Button'

const NAV = [
  { href: '#product', label: 'Product' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#docs', label: 'Docs' },
  { href: '#support', label: 'Support' },
]

/** Logged-out header (4a/4b/4c). `minimal` drops the nav for the auth pages. */
export function PublicHeader({ minimal, trailing }: { minimal?: boolean; trailing?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-canvas">
      <div className="mx-auto max-w-[1180px] px-xl h-16 flex items-center gap-xxl">
        <Logo />
        {!minimal && (
          <nav className="hidden laptop:flex items-center gap-xl">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="text-body text-text-secondary no-underline hover:text-text-primary transition-colors">
                {item.label}
              </a>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-md">
          {trailing ?? (
            <>
              <Link href="/login" className="text-body font-medium text-text-primary no-underline hover:text-primary transition-colors">
                Log in
              </Link>
              <Link
                href="/register"
                className={buttonClass()}
              >
                Start free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
