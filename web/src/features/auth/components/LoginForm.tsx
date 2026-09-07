'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonClass } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { Checkbox, FormLabel, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { ApiError } from '@/types/api'
import * as authApi from '../api'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await authApi.login({ email, password })
      const redirect = searchParams.get('redirect')
      router.push(user.onboardingDone ? redirect || '/dashboard' : '/onboarding')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-lg">
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
          <a href="#lupa-password" className="text-caption text-info no-underline hover:underline">
            Forgot password?
          </a>
        </div>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
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
          Continue with Google Workspace
        </button>
        <button
          type="button"
          disabled
          title="Agency SSO is available on the Premium plan"
          className={cn(buttonClass('secondary'), 'w-full')}
        >
          Agency SSO
          <span className="bg-primary-soft text-[#5A35F3] text-micro font-semibold rounded-xs px-sm py-[2px]">Premium</span>
        </button>
      </div>

      <p className="text-caption text-text-secondary text-center">
        New to Maceut?{' '}
        <Link href="/register" className="text-info no-underline hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  )
}
