'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AppHeader } from '@/components/shared/AppHeader'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { cn } from '@/lib/utils'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    // Staff don't have a workspace — /internal is their whole app.
    else if (user.role === 'internal') router.replace('/internal')
    else if (!user.onboardingDone) router.replace('/onboarding')
  }, [loading, user, router, pathname])

  if (loading || !user || user.role === 'internal') return null

  return (
    <div className="min-h-screen bg-page">
      <AppHeader />
      {/* Studio is a canvas plus a tool drawer — it gets the room; every other page
          keeps the reading width. */}
      <main className={cn('mx-auto px-xl py-xl', pathname.startsWith('/studio') ? 'max-w-[1600px]' : 'max-w-[1180px]')}>
        {children}
      </main>
    </div>
  )
}
