'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/shared/Sidebar'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
  }, [loading, user, router, pathname])

  if (loading || !user) return null

  return (
    <div className="min-h-screen bg-page">
      <Sidebar />
      <main className="ml-64 p-xl">{children}</main>
    </div>
  )
}
