'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AppHeader } from '@/components/shared/AppHeader'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { cn } from '@/lib/utils'
import { PAGE_WIDTH } from '@/components/shared/page-width'
import { SnapScript } from '@/features/billing/snap'

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
      {/* Midtrans Snap (FE-56), at the layout so it is ready before any Pay button. */}
      <SnapScript />
      <AppHeader />
      {/* Same width as the header (page-width.ts), so they always line up. */}
      <main className={cn('mx-auto px-xl py-xl', PAGE_WIDTH)}>
        {children}
      </main>
    </div>
  )
}
