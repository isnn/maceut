'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { FormLabel } from '@/components/ui/Input'
import { OtpInput } from '@/components/ui/OtpInput'
import { ApiError } from '@/types/api'
import * as authApi from '../api'
import { homePathFor } from '../home-path'

/** Seconds before "Send a new code" is offered again — each send replaces the last code. */
const RESEND_COOLDOWN_S = 30

export function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  // A code was just sent (by sign-up, or by the refused sign-in that led here).
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function verify(otp: string) {
    if (otp.length !== 6 || verifying) return
    setVerifying(true)
    setError(null)
    setNotice(null)
    try {
      const user = await authApi.verifyEmail(email, otp)
      router.replace(homePathFor(user))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify the code. Please try again.')
      setCode('')
      setVerifying(false)
    }
  }

  async function resend() {
    setError(null)
    setNotice(null)
    setCooldown(RESEND_COOLDOWN_S)
    try {
      await authApi.resendVerificationCode(email)
      setNotice(`A new code is on its way to ${email}. Earlier codes no longer work.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a new code. Please try again.')
      setCooldown(0)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void verify(code)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-lg">
      {error && <Alert variant="warning">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="space-y-xs">
        <FormLabel htmlFor="otp">6-digit code</FormLabel>
        <OtpInput
          id="otp"
          value={code}
          onChange={setCode}
          onComplete={(v) => void verify(v)}
          disabled={verifying}
          invalid={error !== null}
          aria-describedby="otp-help"
        />
        <p id="otp-help" className="text-caption text-text-muted">
          The code expires after 10 minutes.
        </p>
      </div>

      <Button type="submit" disabled={verifying || code.length !== 6} className="w-full">
        {verifying ? 'Verifying…' : 'Verify email'}
      </Button>

      <p className="text-caption text-text-secondary text-center">
        Didn&rsquo;t get it? Check your spam folder, or{' '}
        {cooldown > 0 ? (
          <span className="text-text-muted tabular-nums">send a new code in {cooldown}s</span>
        ) : (
          <button type="button" onClick={resend} className="text-info font-medium hover:underline">
            send a new code
          </button>
        )}
        .
      </p>
    </form>
  )
}
