'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { buttonClass } from '@/components/ui/Button'
import { IconMenu, IconX } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

/**
 * Only sections that exist on the landing page (FE-36). Docs, Support and a language
 * picker were in the concept, but there is nothing behind them yet.
 */
const NAV = [
  { href: '/#product', label: 'Product' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
]

/** Logged-out header (4a/4b/4c). `minimal` drops the nav for the auth pages. */
export function PublicHeader({ minimal, trailing }: { minimal?: boolean; trailing?: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const linkClass = 'text-body text-text-secondary no-underline hover:text-text-primary transition-colors'

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-canvas">
      <div className="mx-auto max-w-[1600px] px-lg tablet:px-xl h-16 flex items-center gap-xxl">
        {/* Padding makes the wordmark a 44px tap target on phones. */}
        <Logo className="py-sm" />
        {!minimal && (
          <nav aria-label="Main" className="hidden laptop:flex items-center gap-xl">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </a>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-md">
          {trailing ?? (
            <>
              <Link
                href="/login"
                className="hidden tablet:inline-flex text-body font-medium text-text-primary no-underline hover:text-primary transition-colors"
              >
                Log in
              </Link>
              <Link href="/register" className={cn(buttonClass(), 'hidden tablet:inline-flex')}>
                Create free account
              </Link>
            </>
          )}
          {!minimal && !trailing && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls="public-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
              className="laptop:hidden inline-flex items-center justify-center w-11 h-11 rounded-md text-text-primary hover:bg-canvas-secondary focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {open ? <IconX size={20} /> : <IconMenu size={20} />}
            </button>
          )}
        </div>
      </div>

      {!minimal && !trailing && open && (
        <nav id="public-menu" aria-label="Main" className="laptop:hidden border-t border-border bg-canvas px-lg pb-lg">
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center h-11 text-body text-text-primary no-underline"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link href="/login" className="flex items-center h-11 text-body text-text-primary no-underline">
                Log in
              </Link>
            </li>
          </ul>
          <Link href="/register" className={cn(buttonClass(), 'w-full mt-sm')}>
            Create free account
          </Link>
        </nav>
      )}
    </header>
  )
}
