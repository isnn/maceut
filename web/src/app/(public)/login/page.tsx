'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'

function LoginRedirectGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace('/')
  }, [loading, user, router])

  if (loading || user) return null
  return <>{children}</>
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginRedirectGuard>
        <h1 className="text-section-title mb-lg">Masuk ke akun Anda</h1>
        <LoginForm />
        <p className="text-caption text-text-secondary mt-lg text-center">
          Belum punya akun?{' '}
          <Link href="/register" className="text-info no-underline hover:underline">
            Daftar
          </Link>
        </p>
      </LoginRedirectGuard>
    </Suspense>
  )
}
