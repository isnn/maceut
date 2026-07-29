'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { ApiError } from '@/types/api'
import * as authApi from '../api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function RegisterForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const emailError = submitted && !EMAIL_RE.test(email) ? 'Format email tidak valid.' : null
  const passwordError = submitted && password.length < 8 ? 'Password minimal 8 karakter.' : null
  const confirmError = submitted && confirmPassword !== password ? 'Konfirmasi password tidak cocok.' : null
  const clientValid = EMAIL_RE.test(email) && password.length >= 8 && confirmPassword === password

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (!clientValid) return
    setLoading(true)
    try {
      await authApi.register({ email, password, confirmPassword })
      router.push('/zones')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Terjadi kesalahan, coba lagi.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-lg" noValidate>
      <div className="space-y-xs">
        <FormLabel htmlFor="email">Email</FormLabel>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {emailError && <p className="text-caption text-red-600">{emailError}</p>}
        {serverError && <p className="text-caption text-red-600">{serverError}</p>}
      </div>
      <div className="space-y-xs">
        <FormLabel htmlFor="password">Password</FormLabel>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {passwordError && <p className="text-caption text-red-600">{passwordError}</p>}
      </div>
      <div className="space-y-xs">
        <FormLabel htmlFor="confirmPassword">Konfirmasi Password</FormLabel>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {confirmError && <p className="text-caption text-red-600">{confirmError}</p>}
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Memproses...' : 'Daftar'}
      </Button>
    </form>
  )
}
