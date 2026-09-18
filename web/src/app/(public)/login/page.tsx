'use client'

import { Suspense, useEffect } from 'react'
import Image from 'next/image'
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
          {/* Photographic panel — desktop only, so small screens don't pay for the image. */}
          <aside className="relative hidden laptop:flex flex-col justify-between p-section overflow-hidden">
            <Image
              src="/login-freeway.jpg"
              alt="Aerial photography of interlocking freeways with travelling cars"
              fill
              priority
              sizes="50vw"
              className="object-cover"
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/20" />

            <div className="relative">
              <p className="text-page-title font-bold text-white max-w-[22ch] text-balance">
                Every window you scheduled, captured and waiting.
              </p>
              <ul className="mt-xl space-y-md">
                {VALUE_PROPS.map((prop) => (
                  <li key={prop} className="flex items-start gap-sm text-body text-white/85">
                    <IconCheck className="text-white mt-[3px]" />
                    {prop}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative space-y-sm">
              <p className="text-caption text-white/70 max-w-[36ch]">
                Used by provincial and city road agencies across Java and Sumatra.
              </p>
              <p className="text-micro text-white/50">
                Photo by{' '}
                <a
                  href="https://unsplash.com/@ed259"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-white/70 no-underline hover:underline"
                >
                  Ed 259
                </a>{' '}
                on Unsplash
              </p>
            </div>
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
