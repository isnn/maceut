'use client'

import { linkClass } from '@/components/ui/Button'
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { VerifyEmailForm } from '@/features/auth/components/VerifyEmailForm'

/** A 6-digit `?code=` from the email's button, or nothing. */
const codeParam = (v: string | null) => (v && /^\d{6}$/.test(v) ? v : '')

function VerifyEmail() {
  const params = useSearchParams()
  const email = params.get('email')?.trim() ?? ''
  const fromSignup = params.get('from') === 'signup'

  if (!email) {
    return (
      <AuthShell title="Verify your email" lead="Open this page from the sign-up or log-in form, so we know which address to check.">
        <Link href="/login" className={linkClass()}>
          Go to log in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Check your email"
      lead={
        <>
          We sent a 6-digit code to <span className="font-semibold text-text-primary">{email}</span>.{' '}
          {fromSignup ? 'Enter it to finish creating your account.' : 'Verify your email to log in.'}
        </>
      }
      footer={
        fromSignup ? (
          <>
            Already have an account with this email? No code is sent for it —{' '}
            <Link href={`/login?email=${encodeURIComponent(email)}`} className={linkClass()}>
              log in
            </Link>{' '}
            instead.
          </>
        ) : (
          <Link href="/login" className={linkClass()}>
            Back to log in
          </Link>
        )
      }
    >
      <VerifyEmailForm email={email} initialCode={codeParam(params.get('code'))} />
    </AuthShell>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  )
}
