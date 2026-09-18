'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { Dropdown } from '@/components/ui/Dropdown'
import { IconAlert, IconBell, IconCheck, IconInfo } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { useCurrentUser, useLogout } from '@/features/auth/hooks/useAuth'
import { PLAN_LABEL } from '@/lib/constants'
import * as notificationsApi from '@/features/notifications/api'
import type { AppNotification } from '@/features/notifications/api'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/zones', label: 'Zones' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/studio', label: 'Studio' },
  { href: '/team', label: 'Team' },
]

const TONE_MARK: Record<AppNotification['tone'], { Icon: typeof IconAlert; className: string }> = {
  warning: { Icon: IconAlert, className: 'bg-warning-bg text-warning-text' },
  success: { Icon: IconCheck, className: 'bg-success-bg text-success-text' },
  info: { Icon: IconInfo, className: 'bg-info-bg text-info' },
}

function initials(name: string, email: string): string {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase()
}

export function AppHeader() {
  const pathname = usePathname()
  const { user } = useCurrentUser()
  const logout = useLogout()
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  useEffect(() => {
    notificationsApi.getNotifications().then(setNotifications)
  }, [])

  const unread = notifications.filter((n) => !n.read).length

  async function markAllRead() {
    await notificationsApi.markAllRead()
    setNotifications(await notificationsApi.getNotifications())
  }

  return (
    <header className="sticky top-0 z-20 bg-canvas border-b border-border">
      <div className="mx-auto max-w-[1180px] px-xl h-16 flex items-center gap-xxl">
        <Logo href="/dashboard" />

        <nav className="flex items-center gap-lg overflow-x-auto">
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
          <Dropdown
            triggerLabel={`Notifications${unread ? `, ${unread} unread` : ''}`}
            triggerClassName="relative w-10 h-10 rounded-md border border-border bg-canvas hover:bg-canvas-secondary flex items-center justify-center"
            panelClassName="w-[22rem]"
            trigger={
              <>
                <IconBell size={18} className="text-text-secondary" />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-primary text-on-primary text-micro font-semibold flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </>
            }
          >
            {(close) => (
              <div>
                <div className="flex items-center justify-between px-lg py-md border-b border-divider">
                  <span className="text-label font-semibold text-text-primary">Notifications</span>
                  <button onClick={markAllRead} className="text-caption text-info hover:underline">
                    Mark all read
                  </button>
                </div>
                <ul className="max-h-[22rem] overflow-y-auto">
                  {notifications.map((n) => (
                    <li key={n.id} className={cn('px-lg py-md border-b border-divider last:border-b-0', !n.read && 'bg-primary-soft/25')}>
                      <div className="flex gap-sm">
                        <span
                          aria-hidden
                          className={cn(
                            'w-6 h-6 shrink-0 rounded-full flex items-center justify-center',
                            TONE_MARK[n.tone].className
                          )}
                        >
                          {(() => {
                            const { Icon } = TONE_MARK[n.tone]
                            return <Icon size={14} />
                          })()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-label font-semibold text-text-primary">{n.title}</p>
                          <p className="text-caption text-text-secondary mt-xs">{n.body}</p>
                          <div className="flex items-center gap-md mt-xs">
                            <span className="text-micro text-text-muted">{n.time}</span>
                            {n.actionHref && (
                              <Link href={n.actionHref} onClick={close} className="text-micro text-info no-underline hover:underline">
                                {n.actionLabel}
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Dropdown>

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
                      {PLAN_LABEL[user.plan]} plan
                    </span>
                  </div>
                  <nav className="py-xs">
                    {[
                      { href: '/profile', label: 'Profile & usage' },
                      { href: '/profile#billing', label: 'Billing & plan' },
                      { href: '/team', label: 'Workspace settings' },
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
