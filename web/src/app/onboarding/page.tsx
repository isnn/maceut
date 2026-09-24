'use client'

/**
 * Step 2 of sign-up: confirm the account is ready, then go.
 *
 * This used to be a plan picker. With no billing behind it, picking "Premium" was not
 * a sale — it was a form that handed out premium limits to anyone who read the pricing
 * page. Every account now starts on Free and staff grant paid plans from
 * /internal/users, so there is nothing here for the new account to decide.
 *
 * The step is kept rather than skipped because it does real work: it marks
 * onboardingDone, and it is the one moment to say what Free actually includes and what
 * to do first. Dropping someone straight onto an empty dashboard answers neither.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { useCurrentUser, useLogout } from '@/features/auth/hooks/useAuth'
import { PLAN_LABEL, PLAN_LIMITS } from '@/lib/constants'
import { ApiError } from '@/types/api'
import * as authApi from '@/features/auth/api'

export default function OnboardingPage() {
  const { user, loading } = useCurrentUser()
  const router = useRouter()
  const logout = useLogout()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
    // Staff accounts aren't customers — there's no plan for them to start on.
    else if (user.role === 'internal') router.replace('/internal')
  }, [loading, user, router])

  if (loading || !user || user.role === 'internal') return null

  const limits = PLAN_LIMITS.free

  async function start() {
    setStarting(true)
    setError(null)
    try {
      await authApi.completeOnboarding()
      router.push('/dashboard')
    } catch (err) {
      // Previously this failure was swallowed: the button stayed in its pending state
      // with nothing on screen explaining why nothing happened.
      setError(err instanceof ApiError ? err.message : 'Could not finish setting up your account. Please try again.')
      setStarting(false)
    }
  }

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto max-w-[1180px] px-xl h-16 flex items-center gap-lg">
          <Logo href="/onboarding" />
          <span className="ml-auto text-caption text-text-secondary">{user.email}</span>
          <button
            onClick={() => logout()}
            className="text-caption text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[720px] px-xl py-section">
        <p className="text-label text-text-secondary">Step 2 of 2</p>
        <h1 className="text-page-title font-bold text-text-primary mt-xs">
          You&rsquo;re set up, {user.fullName?.split(' ')[0] || 'there'}
        </h1>
        <p className="mt-xs text-body text-text-secondary">
          Your account is on the {PLAN_LABEL.free} plan. Nothing to pay, nothing to choose &mdash; draw a zone and it
          starts collecting.
        </p>

        <section className="mt-xl bg-card border border-border rounded-lg divide-y divide-divider">
          <IncludedRow
            label="Zones"
            value={`${limits.zonesLimit} ${limits.zonesLimit === 1 ? 'zone' : 'zones'}`}
            note="An area you draw on the map. Traffic is collected inside its boundary."
          />
          <IncludedRow
            label="Capture windows"
            value={`${limits.schedulesLimit} active`}
            note="The hours a zone collects — for example weekdays, 07:00 to 09:00."
          />
          <IncludedRow
            label="Captures"
            value={`${limits.capturesLimit} per day`}
            note="Counted per day in WIB, across every zone."
          />
          <IncludedRow label="Road data" value="Jalan Nasional" note="Arterial roads between cities and metro areas." />
        </section>

        <div className="mt-xl flex items-center gap-lg">
          <Button onClick={start} disabled={starting}>
            {starting ? 'Finishing…' : 'Go to dashboard'}
          </Button>
          <span className="text-caption text-text-muted">
            Need more zones or finer intervals? Contact us and we&rsquo;ll move you up a plan.
          </span>
        </div>
        {error && <p className="mt-md text-caption text-danger-text">{error}</p>}
      </main>
    </div>
  )
}

function IncludedRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="p-lg flex items-baseline gap-lg">
      <p className="text-label text-text-secondary w-40 shrink-0">{label}</p>
      <div>
        <p className="text-body text-text-primary font-semibold">{value}</p>
        <p className="text-caption text-text-muted mt-xs">{note}</p>
      </div>
    </div>
  )
}
