'use client'

import { Suspense, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { IconCheck } from '@/components/ui/icons'

const VALUE_PROPS = [
  'Zones drawn or imported as GeoJSON / SHP',
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
        {/* No header chrome — the wordmark sits on the photograph instead. */}
        <main className="flex-1 grid grid-cols-1 laptop:grid-cols-[38%_1fr]">
          <aside className="relative hidden laptop:flex flex-col justify-between p-xxl overflow-hidden">
            <Image
              src="/login-freeway.jpg"
              alt="Aerial photography of interlocking freeways with travelling cars"
              fill
              priority
              sizes="40vw"
              className="object-cover"
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/25" />

            <Logo href="/" tone="on-dark" className="relative" />

            <div className="relative space-y-xl">
              <p className="text-display text-white max-w-[16ch] text-balance">
                Every window you scheduled, captured and waiting.
              </p>
              <ul className="space-y-md">
                {VALUE_PROPS.map((prop) => (
                  <li key={prop} className="flex items-start gap-sm text-body text-white/85">
                    <span className="mt-[1px] w-5 h-5 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                      <IconCheck size={13} className="text-white" />
                    </span>
                    {prop}
                  </li>
                ))}
              </ul>
              <div className="space-y-xs pt-md border-t border-white/15">
                <p className="text-caption text-white/70">
                  Used by provincial and city road agencies across Java and Sumatra.
                </p>
                <p className="text-micro text-white/45">
                  Photo by{' '}
                  <a
                    href="https://unsplash.com/@ed259"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-white/60 no-underline hover:underline"
                  >
                    Ed 259
                  </a>{' '}
                  on Unsplash
                </p>
              </div>
            </div>
          </aside>

          <div className="bg-page flex items-center justify-center p-xl">
            <div className="w-full max-w-[26rem]">
              <div className="laptop:hidden mb-xl">
                <Logo href="/" />
              </div>

              <h1 className="text-display text-text-primary">Log in</h1>
              <p className="mt-xs text-body text-text-secondary mb-xl">
                Welcome back. Pick up where your zones left off.
              </p>

              <div className="bg-card border border-border rounded-lg p-xl">
                <LoginForm />
              </div>

              <p className="text-body text-text-secondary text-center mt-xl">
                New to Maceut?{' '}
                <Link href="/register" className="text-info font-medium no-underline hover:underline">
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        </main>
      </LoginRedirectGuard>
    </Suspense>
  )
}
