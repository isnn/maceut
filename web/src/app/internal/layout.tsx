'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { InternalHeader, SUPERADMIN_PATHS } from '@/components/shared/InternalHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { accessOf } from '@/features/auth/types'
import { PAGE_WIDTH } from '@/components/shared/page-width'
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
      {/* Same width as the header (page-width.ts), so they always line up. */}
      <main className={`mx-auto px-xl py-xl ${PAGE_WIDTH}`}>
        {/* Admins help customers; platform pages are for superadmins (FE-34). The API
            refuses them too — this just says so instead of showing a failed load. */}
        {accessOf(user) !== 'superadmin' && SUPERADMIN_PATHS.some((p) => pathname.startsWith(p)) ? (
          <EmptyState
            title="Superadmins only"
            description="This page is managed by a superadmin. Overview and Users are available to you."
          />
        ) : (
          children
        )}
      </main>
    </div>
  )
}
