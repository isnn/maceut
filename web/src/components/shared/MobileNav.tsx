'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconMenu, IconX } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface MobileNavItem {
  href: string
  label: string
  active: boolean
}

/**
 * Below `laptop` the app and staff headers fold their nav into a ☰ (same behaviour as
 * PublicHeader): the bar keeps the logo, bell and account menu, and the sections open
 * in a panel under it. It closes on Escape, on a tap outside it, and whenever the page
 * changes — not only when one of its own links is picked, so the logo, the bell, the
 * account menu and the browser's back button don't leave it hanging open.
 *
 * The toggle and the panel carry `data-mobile-nav`; a tap on either isn't "outside".
 */
export function useMobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [shownAt, setShownAt] = useState(pathname)
  if (shownAt !== pathname) {
    setShownAt(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-mobile-nav]')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return { open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }
}

export function MobileNavToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? 'Close menu' : 'Open menu'}
      data-mobile-nav
      onClick={onToggle}
      className="laptop:hidden inline-flex items-center justify-center w-11 h-11 rounded-md text-text-primary hover:bg-canvas-secondary focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {open ? <IconX size={20} /> : <IconMenu size={20} />}
    </button>
  )
}

export function MobileNavPanel({ id, items, onPick }: { id: string; items: MobileNavItem[]; onPick: () => void }) {
  return (
    <nav id={id} aria-label="Main" data-mobile-nav className="laptop:hidden border-t border-border bg-canvas px-lg py-sm">
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onPick}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'flex items-center h-11 px-md rounded-md text-body no-underline transition-colors',
                item.active
                  ? 'bg-primary-soft text-primary font-semibold'
                  : 'text-text-primary hover:bg-canvas-secondary',
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
