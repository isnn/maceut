'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AppHeader } from '@/components/shared/AppHeader'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    else if (!user.onboardingDone) router.replace('/onboarding')
  }, [loading, user, router, pathname])

  if (loading || !user) return null

  return (
    <div className="min-h-screen bg-page">
      <AppHeader />
      <main className="mx-auto max-w-[1180px] px-xl py-xl">{children}</main>
    </div>
  )
}
