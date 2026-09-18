'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { Dropdown } from '@/components/ui/Dropdown'
import { cn } from '@/lib/utils'
import { useCurrentUser, useLogout } from '@/features/auth/hooks/useAuth'

const NAV_ITEMS = [
  { href: '/internal', label: 'Overview' },
  { href: '/internal/users', label: 'Users' },
  { href: '/internal/config', label: 'Configuration' },
]

function initials(name: string, email: string): string {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase()
}

/** Header for the staff area — deliberately distinct from the tenant AppHeader. */
export function InternalHeader() {
  const pathname = usePathname()
  const { user } = useCurrentUser()
  const logout = useLogout()

  return (
    <header className="sticky top-0 z-20 bg-canvas border-b border-border">
      <div className="mx-auto max-w-[1180px] px-xl h-16 flex items-center gap-xxl">
        <div className="flex items-center gap-sm">
          <Logo href="/internal" />
          <span className="bg-primary-soft text-[#5A35F3] text-micro font-semibold rounded-xs px-sm py-xs uppercase tracking-wide">
            Internal
          </span>
        </div>

        <nav className="flex items-center gap-lg overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/internal' ? pathname === item.href : pathname.startsWith(item.href)
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

        <div className="ml-auto flex items-center gap-md">
          <Link href="/dashboard" className="text-body text-text-secondary no-underline hover:text-text-primary transition-colors">
            Back to workspace
          </Link>
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
                    <span className="inline-block mt-sm bg-primary-soft text-[#5A35F3] text-micro font-semibold rounded-xs px-sm py-xs">
                      Internal
                    </span>
                  </div>
                  <nav className="py-xs">
                    <Link
                      href="/dashboard"
                      onClick={close}
                      role="menuitem"
                      className="block px-lg py-sm text-body text-text-secondary no-underline hover:bg-canvas-secondary hover:text-text-primary transition-colors"
                    >
                      Exit to workspace
                    </Link>
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
