'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AppHeader } from '@/components/shared/AppHeader'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { cn } from '@/lib/utils'
import { PAGE_WIDTH } from '@/components/shared/page-width'
import { SnapScript } from '@/features/billing/snap'
import { AccountUnavailable } from '@/components/shared/AccountUnavailable'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, error, retry } = useCurrentUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading || error) return
    if (!user) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    // Staff don't have a workspace — /internal is their whole app.
    else if (user.role === 'internal') router.replace('/internal')
    else if (!user.onboardingDone) router.replace('/onboarding')
  }, [loading, error, user, router, pathname])

  // Never a bare white page: the shell shows while the account loads, and a failure
  // to reach the server says so with a way to try again.
  if (error) return <AccountUnavailable message={error} onRetry={retry} />
  if (loading || !user || user.role === 'internal') return <div className="min-h-screen bg-page" aria-busy="true" />

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
