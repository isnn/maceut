'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonClass, linkClass } from '@/components/ui/Button'
import { IconMail } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { Checkbox, FormLabel, Input, PasswordInput } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { ApiError } from '@/types/api'
import * as authApi from '../api'
import { homePathFor } from '../home-path'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  // Arrived from a finished password reset.
  const justReset = searchParams.get('reset') === '1'
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await authApi.login({ email, password })
      const home = homePathFor(user)
      // ?redirect= points into the tenant app, which staff can't open — send
      // them home instead of bouncing them off a page they'd be redirected from.
      const redirect = searchParams.get('redirect')
      router.push(home === '/dashboard' && redirect ? redirect : home)
    } catch (err) {
      // Right password, unverified address: Better Auth has already sent a new code,
      // so go straight to where it's entered rather than showing a dead-end error.
      if (err instanceof ApiError && err.code === authApi.EMAIL_NOT_VERIFIED) {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim())}&from=login`)
        return
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-lg">
      {searchParams.get('expired') === '1' && !error && (
        <Alert variant="info">Your session ended. Log in again to pick up where you left off.</Alert>
      )}
      {justReset && !error && <Alert variant="success">Your password has been changed. Log in with the new one.</Alert>}
      {error && <Alert variant="warning">{error}</Alert>}

      <div className="space-y-xs">
        <FormLabel htmlFor="email">Work email</FormLabel>
        <Input
          id="email"
          type="email"
          required
          placeholder="rizky@binamarga.go.id"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-xs">
        <div className="flex items-center justify-between">
          <FormLabel htmlFor="password">Password</FormLabel>
          <Link
            href={email ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : '/forgot-password'}
            className={linkClass('caption')}
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      <label className="flex items-center gap-sm text-body text-text-secondary">
        <Checkbox defaultChecked />
        Keep me signed in on this device
      </label>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Signing in…' : 'Log in'}
      </Button>

      <div className="flex items-center gap-md">
        <span className="h-px flex-1 bg-divider" />
        <span className="text-micro text-text-muted uppercase tracking-wide">Or</span>
        <span className="h-px flex-1 bg-divider" />
      </div>

      <div className="space-y-sm">
        <button
          type="button"
          disabled
          title="SSO is not wired up in this build"
          className={cn(buttonClass('secondary'), 'w-full')}
        >
          <IconMail size={18} />
          Continue with Google Workspace
        </button>
      </div>

    </form>
  )
}
