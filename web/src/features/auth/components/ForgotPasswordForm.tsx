'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { FormLabel, Input, PasswordInput } from '@/components/ui/Input'
import { OtpInput } from '@/components/ui/OtpInput'
import { ApiError } from '@/types/api'
import * as authApi from '../api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Two steps on one screen: ask for a code, then use it to set a new password.
 *
 * Step 1 answers the same whether or not the address has an account — Better Auth
 * does, and the copy follows ("if an account exists"), so the form can't be used to
 * check who has one.
 */
export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await authApi.requestPasswordReset(email.trim())
      setStep('reset')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await authApi.resetPassword(email.trim(), code, password)
      router.push(`/login?reset=1&email=${encodeURIComponent(email.trim())}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset the password. Please try again.')
      setLoading(false)
    }
  }

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} className="space-y-lg" noValidate>
        {error && <Alert variant="warning">{error}</Alert>}
        <div className="space-y-xs">
          <FormLabel htmlFor="email">Work email</FormLabel>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Sending…' : 'Send reset code'}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={reset} className="space-y-lg" noValidate>
      <Alert variant="success">
        If an account exists for {email.trim()}, a 6-digit code is on its way. It expires after 10 minutes.
      </Alert>
      {error && <Alert variant="warning">{error}</Alert>}

      <div className="space-y-xs">
        <FormLabel htmlFor="otp">Code from the email</FormLabel>
        <OtpInput id="otp" value={code} onChange={setCode} disabled={loading} invalid={error !== null && code.length === 6} />
      </div>

      <div className="space-y-xs">
        <FormLabel htmlFor="password">New password</FormLabel>
        <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="text-caption text-text-muted">At least 8 characters.</p>
      </div>

      <Button type="submit" disabled={loading || code.length !== 6} className="w-full">
        {loading ? 'Saving…' : 'Set new password'}
      </Button>

      <p className="text-caption text-text-secondary text-center">
        Wrong address or no email?{' '}
        <button
          type="button"
          onClick={() => {
            setStep('email')
            setCode('')
            setError(null)
          }}
          className="text-info font-medium hover:underline"
        >
          Start again
        </button>
      </p>
    </form>
  )
}
