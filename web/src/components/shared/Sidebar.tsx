'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useCurrentUser, useLogout } from '@/features/auth/hooks/useAuth'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/zones', label: 'Zona' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useCurrentUser()
  const logout = useLogout()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-canvas border-r border-border flex flex-col p-lg">
      <div className="px-sm py-md">
        <span className="text-section-title text-text-primary">Maceut</span>
      </div>
      <nav className="flex-1 space-y-xs mt-lg">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block px-md py-sm rounded-md text-body transition-colors',
                active ? 'bg-primary-soft text-[#5A35F3] font-semibold' : 'text-text-secondary hover:bg-canvas-secondary'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-divider pt-md px-sm space-y-sm">
        {user && <p className="text-caption text-text-muted truncate">{user.email}</p>}
        <button onClick={() => logout()} className="text-label text-text-secondary hover:text-text-primary transition-colors">
          Keluar
        </button>
      </div>
    </aside>
  )
}
