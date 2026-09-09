'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { InternalHeader } from '@/components/shared/InternalHeader'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'

/**
 * Gate for the staff area. This is UI gating, not authorization — anyone can
 * edit their role in devtools. Real enforcement has to live in backend
 * middleware once api/ exists, and every /internal endpoint must re-check.
 */
export default function InternalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    else if (user.role !== 'internal') router.replace('/dashboard')
  }, [loading, user, router, pathname])

  if (loading || !user || user.role !== 'internal') return null

  return (
    <div className="min-h-screen bg-page">
      <InternalHeader />
      <main className="mx-auto max-w-[1180px] px-xl py-xl">{children}</main>
    </div>
  )
}
