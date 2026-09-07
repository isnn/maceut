'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
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
      const user = await authApi.login({ email, password })
      const redirect = searchParams.get('redirect')
      router.push(user.onboardingDone ? redirect || '/dashboard' : '/onboarding')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan, coba lagi.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-lg">
      {error && <Alert variant="warning">{error}</Alert>}

      <div className="space-y-xs">
        <FormLabel htmlFor="email">Email kerja</FormLabel>
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
            Lupa password?
          </a>
        </div>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      <label className="flex items-center gap-sm text-body text-text-secondary">
        <input type="checkbox" defaultChecked className="w-5 h-5 rounded-xs border-border text-primary focus:ring-primary focus:ring-2" />
        Tetap masuk di perangkat ini
      </label>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Memproses...' : 'Masuk'}
      </Button>

      <div className="flex items-center gap-md">
        <span className="h-px flex-1 bg-divider" />
        <span className="text-micro text-text-muted uppercase tracking-wide">Atau</span>
        <span className="h-px flex-1 bg-divider" />
      </div>

      <div className="space-y-sm">
        <button
          type="button"
          disabled
          title="SSO belum tersedia di build ini"
          className="h-12 w-full px-xl bg-canvas border border-border text-text-primary font-semibold rounded-md hover:bg-canvas-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Lanjutkan dengan Google Workspace
        </button>
        <button
          type="button"
          disabled
          title="SSO instansi tersedia di paket Premium"
          className="h-12 w-full px-xl bg-canvas border border-border text-text-primary font-semibold rounded-md hover:bg-canvas-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-sm"
        >
          SSO Instansi
          <span className="bg-primary-soft text-[#5A35F3] text-micro font-semibold rounded-xs px-sm py-[2px]">Premium</span>
        </button>
      </div>

      <p className="text-caption text-text-secondary text-center">
        Baru di Maceut?{' '}
        <Link href="/register" className="text-info no-underline hover:underline">
          Buat akun
        </Link>
      </p>
    </form>
  )
}
