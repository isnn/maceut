'use client'

import { linkClass } from '@/components/ui/Button'
import { Suspense, useEffect } from 'react'
import { Alert } from '@/components/ui/Alert'
import { PLAN_LABEL } from '@/lib/constants'
import { isPaidPlan, rememberIntendedPlan } from '@/features/marketing/intended-plan'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { homePathFor } from '@/features/auth/home-path'

function RegisterPageContent() {
  const { user, loading } = useCurrentUser()
  const router = useRouter()
  /** A paid plan picked on /pricing (FE-37): remembered, started on Free. */
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan')
  const intended = isPaidPlan(planParam) ? planParam : null

  useEffect(() => {
    if (intended) rememberIntendedPlan(intended)
  }, [intended])

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
          We&rsquo;ll email you a code to verify your address, then you&rsquo;re in.
        </p>
        {intended && (
          <Alert variant="info" className="mb-lg">
            You picked {PLAN_LABEL[intended]}. Your account starts on Free, and {PLAN_LABEL[intended]} is ready to
            choose as soon as payment opens.
          </Alert>
        )}

        <div className="bg-card border border-border rounded-lg p-xl">
          <RegisterForm />
        </div>

        <p className="text-body text-text-secondary text-center mt-xl">
          Already have an account?{' '}
          <Link href="/login" className={linkClass()}>
            Log in
          </Link>
        </p>
      </div>
    </main>
  )
}

/** `useSearchParams` needs a Suspense boundary in the app router. */
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageContent />
    </Suspense>
  )
}
