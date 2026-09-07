'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { useCurrentUser, useLogout } from '@/features/auth/hooks/useAuth'
import { PLAN_LABEL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { IconCheck } from '@/components/ui/icons'
import * as authApi from '@/features/auth/api'
import type { Plan } from '@/features/auth/types'

const STEPS = ['Account', 'First zone', 'Choose a plan']

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
        <ol className="flex flex-wrap items-center gap-lg mb-xxl">
          {STEPS.map((label, i) => {
            const done = i < 2
            const active = i === 2
            return (
              <li key={label} className="flex items-center gap-sm">
                <span
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-label font-semibold',
                    done && 'bg-success-bg text-success-text',
                    active && 'bg-primary text-on-primary',
                    !done && !active && 'bg-canvas-secondary text-text-muted'
                  )}
                >
                  {done ? <IconCheck /> : i + 1}
                </span>
                <span className={cn('text-body', active ? 'text-text-primary font-semibold' : 'text-text-secondary')}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <span aria-hidden className="w-8 h-px bg-border ml-md" />}
              </li>
            )
          })}
        </ol>

        <div className="grid grid-cols-1 laptop:grid-cols-[1fr_320px] gap-xl items-start">
          <div>
            <h1 className="text-page-title font-bold text-text-primary">Choose a plan</h1>
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
                Back
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
              <p className="text-label text-text-secondary">First zone</p>
              <p className="text-body text-text-primary font-medium">Created after setup</p>
              <p className="text-caption text-text-muted mt-xs">
                Your first zone starts collecting once you set its capture windows on the Schedule page.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
