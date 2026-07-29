'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'

export default function RegisterPage() {
  const { user, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace('/')
  }, [loading, user, router])

  if (loading || user) return null

  return (
    <>
      <h1 className="text-section-title mb-lg">Buat akun Maceut</h1>
      <RegisterForm />
      <p className="text-caption text-text-secondary mt-lg text-center">
        Sudah punya akun?{' '}
        <Link href="/login" className="text-info no-underline hover:underline">
          Masuk
        </Link>
      </p>
    </>
  )
}
