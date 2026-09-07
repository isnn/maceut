'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'

const VALUE_PROPS = [
  'Zona digambar langsung di peta sebagai GeoJSON',
  'Jendela capture berulang per zona',
  'Pemutaran Studio lintas frame tersimpan',
]

function LoginRedirectGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace(user.onboardingDone ? '/dashboard' : '/onboarding')
  }, [loading, user, router])

  if (loading || user) return null
  return <>{children}</>
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginRedirectGuard>
        <PublicHeader minimal />
        <main className="flex-1 grid grid-cols-1 laptop:grid-cols-2">
          <aside className="hidden laptop:flex flex-col justify-between bg-canvas-secondary border-r border-border p-section">
            <div>
              <p className="text-page-title font-bold text-text-primary max-w-[22ch] text-balance">
                Setiap jendela yang Anda jadwalkan, ter-capture dan tersimpan.
              </p>
              <ul className="mt-xl space-y-md">
                {VALUE_PROPS.map((prop) => (
                  <li key={prop} className="flex items-start gap-sm text-body text-text-secondary">
                    <span aria-hidden className="text-success-icon mt-[2px]">✓</span>
                    {prop}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-caption text-text-muted max-w-[36ch]">
              Dipakai instansi jalan provinsi dan kota di Jawa dan Sumatra.
            </p>
          </aside>

          <div className="flex items-center justify-center p-xl">
            <div className="w-full max-w-[24rem]">
              <h1 className="text-page-title font-bold text-text-primary">Masuk</h1>
              <p className="mt-xs text-body text-text-secondary mb-xl">
                Selamat datang kembali. Lanjutkan dari zona terakhir Anda.
              </p>
              <LoginForm />
            </div>
          </div>
        </main>
      </LoginRedirectGuard>
    </Suspense>
  )
}
