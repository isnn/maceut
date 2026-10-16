'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { useCurrentUser } from '../hooks/useAuth'
import { homePathFor } from '../home-path'

/**
 * The frame of the smaller signed-out screens (verify email, forgot password): the
 * register page's column, and the same redirect home for anyone already signed in.
 */
export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string
  lead: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const { user, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace(homePathFor(user))
  }, [loading, user, router])

  if (loading || user) return null

  return (
    <main className="flex-1 bg-page flex justify-center px-xl py-section">
      <div className="w-full max-w-[28rem]">
        <Logo href="/" />
        <h1 className="mt-xxl text-display text-text-primary">{title}</h1>
        <div className="mt-xs text-body text-text-secondary mb-xl">{lead}</div>
        <div className="bg-card border border-border rounded-lg p-xl">{children}</div>
        {footer && <div className="text-body text-text-secondary text-center mt-xl">{footer}</div>}
      </div>
    </main>
  )
}
