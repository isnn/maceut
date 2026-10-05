'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { Dropdown } from '@/components/ui/Dropdown'
import { cn } from '@/lib/utils'
import { PlanPill } from '@/components/ui/Badge'
import { PAGE_WIDTH } from './page-width'
import { useCurrentUser, useLogout } from '@/features/auth/hooks/useAuth'
import { NotificationBell } from '@/features/notifications/NotificationBell'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/zones', label: 'Zones' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/studio', label: 'Studio' },
]

function initials(name: string, email: string): string {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase()
}

export function AppHeader() {
  const pathname = usePathname()
  const { user } = useCurrentUser()
  const logout = useLogout()
  return (
    <header className="sticky top-0 z-20 bg-canvas border-b border-border">
      <div className={cn('mx-auto px-xl h-16 flex items-center gap-xxl', PAGE_WIDTH)}>
        <Logo href="/dashboard" />

        <nav className="flex items-center gap-xl overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative py-[21px] text-body no-underline whitespace-nowrap transition-colors',
                  active
                    ? 'text-text-primary font-semibold after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-primary'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-sm">
          <NotificationBell />

          {user && (
            <Dropdown
              triggerLabel="Account menu"
              triggerClassName="w-10 h-10 rounded-full bg-primary-soft text-[#5A35F3] text-label font-bold flex items-center justify-center hover:bg-primary-soft/70"
              trigger={<>{initials(user.fullName, user.email)}</>}
            >
              {(close) => (
                <div>
                  <div className="px-lg py-md border-b border-divider">
                    <p className="text-label font-semibold text-text-primary truncate">{user.fullName || user.email}</p>
                    <p className="text-caption text-text-muted truncate">{user.email}</p>
                    <PlanPill plan={user.plan} className="mt-sm" />
                  </div>
                  <nav className="py-xs">
                    {[
                      { href: '/profile', label: 'Profile & usage' },
                      { href: '/profile#billing', label: 'Billing & plan' },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={close}
                        role="menuitem"
                        className="block px-lg py-sm text-body text-text-secondary no-underline hover:bg-canvas-secondary hover:text-text-primary transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                  <div className="border-t border-divider py-xs">
                    <button
                      role="menuitem"
                      onClick={() => {
                        close()
                        logout()
                      }}
                      className="w-full text-left px-lg py-sm text-body text-danger-text hover:bg-danger-bg/60 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </Dropdown>
          )}
        </div>
      </div>
    </header>
  )
}
