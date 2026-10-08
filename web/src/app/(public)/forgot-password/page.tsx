'use client'

import { linkClass } from '@/components/ui/Button'
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'

function ForgotPassword() {
  const params = useSearchParams()
  return (
    <AuthShell
      title="Reset your password"
      lead="We'll email you a 6-digit code to set a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className={linkClass()}>
            Log in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm initialEmail={params.get('email') ?? ''} />
    </AuthShell>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPassword />
    </Suspense>
  )
}
