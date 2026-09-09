'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { useCurrentUser, useLogout } from '@/features/auth/hooks/useAuth'
import { SignupSteps } from '@/components/shared/SignupSteps'
import { PLAN_LABEL } from '@/lib/constants'
import * as authApi from '@/features/auth/api'
import type { Plan } from '@/features/auth/types'

export default function OnboardingPage() {
  const { user, loading } = useCurrentUser()
  const router = useRouter()
  const logout = useLogout()
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) return null

  // The plan chosen at sign-up is pre-selected; picking a card commits it.
  const plan: Plan = pendingPlan ?? user.plan

  async function choosePlan(next: Plan) {
    setPendingPlan(next)
    await authApi.updatePlan(next)
    await authApi.completeOnboarding()
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto max-w-[1180px] px-xl h-16 flex items-center gap-lg">
          <Logo href="/onboarding" />
          <span className="ml-auto text-caption text-text-secondary">{user.email}</span>
          <button onClick={() => logout()} className="text-caption text-text-secondary hover:text-text-primary transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1180px] px-xl py-section">
        <div className="mb-xxl">
          <SignupSteps current={1} />
        </div>

        <div className="grid grid-cols-1 laptop:grid-cols-[1fr_320px] gap-xl items-start">
          <div>
            <h1 className="text-page-title font-bold text-text-primary">Choose your plan</h1>
            <p className="mt-xs text-body text-text-secondary mb-xl">
              Start free and upgrade when you need more zones or more frequent captures.
            </p>
            <PlanCards
              selected={plan}
              onSelect={choosePlan}
              pendingPlan={pendingPlan}
              actionLabel={(p) => (p === 'free' ? 'Start free' : `Choose ${PLAN_LABEL[p]}`)}
            />
            <div className="mt-xl flex items-center justify-between">
              <button
                onClick={() => router.push('/register')}
                className="text-body text-text-secondary hover:text-text-primary transition-colors"
              >
                Back to details
              </button>
              <span className="text-caption text-text-muted">No card needed for Free</span>
            </div>
          </div>

          <aside className="bg-card border border-border rounded-lg p-xl space-y-lg">
            <div>
              <p className="text-label text-text-secondary">Account</p>
              <p className="text-body text-text-primary font-medium">{user.fullName || user.email}</p>
              <p className="text-caption text-text-muted">{user.email}</p>
            </div>
            <div className="border-t border-divider pt-lg">
              <p className="text-label text-text-secondary">Organisation</p>
              <p className="text-body text-text-primary font-medium">{user.organisation || '—'}</p>
            </div>
            <div className="border-t border-divider pt-lg">
              <p className="text-label text-text-secondary">What happens next</p>
              <p className="text-body text-text-primary font-medium">Straight to your dashboard</p>
              <p className="text-caption text-text-muted mt-xs">
                Draw your first zone from there — it starts collecting once you set its capture windows on the
                Schedule page.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
