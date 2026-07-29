'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
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
      await authApi.login({ email, password })
      const redirect = searchParams.get('redirect')
      router.push(redirect || '/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan, coba lagi.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-lg">
      {error && <Alert variant="warning">{error}</Alert>}
      <div className="space-y-xs">
        <FormLabel htmlFor="email">Email</FormLabel>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-xs">
        <FormLabel htmlFor="password">Password</FormLabel>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Memproses...' : 'Masuk'}
      </Button>
    </form>
  )
}
