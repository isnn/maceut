'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { IconCheck } from '@/components/ui/icons'

const VALUE_PROPS = [
  'Zones drawn straight onto the map as GeoJSON',
  'Recurring capture windows per zone',
  'Studio playback across saved frames',
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
                Every window you scheduled, captured and waiting.
              </p>
              <ul className="mt-xl space-y-md">
                {VALUE_PROPS.map((prop) => (
                  <li key={prop} className="flex items-start gap-sm text-body text-text-secondary">
                    <IconCheck className="text-success-icon mt-[3px]" />
                    {prop}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-caption text-text-muted max-w-[36ch]">
              Used by provincial and city road agencies across Java and Sumatra.
            </p>
          </aside>

          <div className="flex items-center justify-center p-xl">
            <div className="w-full max-w-[24rem]">
              <h1 className="text-page-title font-bold text-text-primary">Log in</h1>
              <p className="mt-xs text-body text-text-secondary mb-xl">
                Welcome back. Pick up where your zones left off.
              </p>
              <LoginForm />
            </div>
          </div>
        </main>
      </LoginRedirectGuard>
    </Suspense>
  )
}
