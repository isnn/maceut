'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Checkbox, FormLabel, Input, PasswordInput } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { ApiError } from '@/types/api'
import * as authApi from '../api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/


/** 0-3; drives the strength meter under the password field. */
function passwordScore(value: string): number {
  let score = 0
  if (value.length >= 8) score++
  if (value.length >= 12) score++
  if (/[^a-zA-Z0-9]/.test(value) || (/[a-zA-Z]/.test(value) && /[0-9]/.test(value))) score++
  return Math.min(score, 3)
}

const STRENGTH_LABEL = ['Too short', 'Weak', 'Fair', 'Strong']

export function RegisterForm() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const score = passwordScore(password)
  const nameError = submitted && !fullName.trim() ? 'Full name is required.' : null
  const emailError = submitted && !EMAIL_RE.test(email) ? 'Enter a valid email address.' : null
  const passwordError = submitted && password.length < 8 ? 'Password must be at least 8 characters.' : null
  const agreedError = submitted && !agreed ? 'You need to accept the terms of service.' : null
  const clientValid = fullName.trim() !== '' && EMAIL_RE.test(email) && password.length >= 8 && agreed

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (!clientValid) return
    setLoading(true)
    try {
      await authApi.register({ fullName, organisation, email, password })
      router.push('/onboarding')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-lg" noValidate>
      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
        <div className="space-y-xs">
          <FormLabel htmlFor="fullName">Full name</FormLabel>
          <Input id="fullName" placeholder="Rizky Zulkarnain" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          {nameError && <p className="text-caption text-danger-text">{nameError}</p>}
        </div>
        <div className="space-y-xs">
          <FormLabel htmlFor="organisation">Organisation</FormLabel>
          <Input
            id="organisation"
            placeholder="Dinas Bina Marga"
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-xs">
        <FormLabel htmlFor="email">Work email</FormLabel>
        <Input id="email" type="email" placeholder="rizky@binamarga.go.id" value={email} onChange={(e) => setEmail(e.target.value)} />
        {emailError && <p className="text-caption text-danger-text">{emailError}</p>}
        {serverError && <p className="text-caption text-danger-text">{serverError}</p>}
      </div>

      <div className="space-y-xs">
        <FormLabel htmlFor="password">Password</FormLabel>
        <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex items-center gap-sm">
          <div className="flex gap-xs flex-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  password && score > i ? (score === 3 ? 'bg-success-icon' : 'bg-warning-icon') : 'bg-canvas-secondary'
                )}
              />
            ))}
          </div>
          {password && <span className="text-micro text-text-muted">{STRENGTH_LABEL[score]}</span>}
        </div>
        {passwordError && <p className="text-caption text-danger-text">{passwordError}</p>}
      </div>


      <label className="flex items-start gap-sm text-body text-text-secondary">
        <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-[2px] shrink-0" />
        <span>
          I agree to the <span className="text-info">Terms of Service</span> and to traffic data being collected within
          the zones I define.
        </span>
      </label>
      {agreedError && <p className="text-caption text-danger-text">{agreedError}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Creating account…' : 'Continue to plan'}
      </Button>
    </form>
  )
}
