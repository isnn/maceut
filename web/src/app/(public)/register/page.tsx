'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { homePathFor } from '@/features/auth/home-path'

export default function RegisterPage() {
  const { user, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace(homePathFor(user))
  }, [loading, user, router])

  if (loading || user) return null

  return (
    /* No header chrome — the wordmark sits at the top of the form column. */
    <main className="flex-1 bg-page flex justify-center px-xl py-section">
      <div className="w-full max-w-[34rem]">
        <Logo href="/" />

        <h1 className="mt-xxl text-display text-text-primary">Create your account</h1>
        <p className="mt-xs text-body text-text-secondary mb-xl">
          One account per agency workspace — invite your team afterwards. You&rsquo;ll pick a plan next.
        </p>

        <div className="bg-card border border-border rounded-lg p-xl">
          <RegisterForm />
        </div>

        <p className="text-body text-text-secondary text-center mt-xl">
          Already have an account?{' '}
          <Link href="/login" className="text-info font-medium no-underline hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  )
}
