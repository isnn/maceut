'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'

export default function RegisterPage() {
  const { user, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace(user.onboardingDone ? '/dashboard' : '/onboarding')
  }, [loading, user, router])

  if (loading || user) return null

  return (
    <>
      <PublicHeader
        minimal
        trailing={
          <span className="text-body text-text-secondary">
            Already have an account?{' '}
            <Link href="/login" className="text-info no-underline hover:underline">
              Log in
            </Link>
          </span>
        }
      />
      <main className="flex-1 flex justify-center px-xl py-section">
        <div className="w-full max-w-[34rem]">
          <h1 className="text-page-title font-bold text-text-primary">Create your account</h1>
          <p className="mt-xs text-body text-text-secondary mb-xl">
            One account per agency workspace — invite your team afterwards.
          </p>
          <RegisterForm />
        </div>
      </main>
    </>
  )
}
