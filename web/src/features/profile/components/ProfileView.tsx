'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, buttonClass } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { UsageMeter, AttributeRow } from '@/components/ui/UsageMeter'
import { Checkbox } from '@/components/ui/Input'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { cn } from '@/lib/utils'
import { IconCheck } from '@/components/ui/icons'
import { PLAN_LABEL, PLAN_LIMITS, PLAN_ORDER, PLAN_PRICE, ROAD_CLASS_LABEL } from '@/lib/constants'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as authApi from '@/features/auth/api'
import * as dashboardApi from '@/features/dashboard/api'
import type { UsageSummary } from '@/features/dashboard/api'
import type { Plan } from '@/features/auth/types'
import { ApiError } from '@/types/api'

const ALL_TABS = ['Usage', 'Account', 'Billing', 'Notifications'] as const
type Tab = (typeof ALL_TABS)[number]

/**
 * Staff see only Account and Notifications. Usage and Billing are customer
 * concerns — an internal account has no plan quota to report, and its
 * seeded figures would be noise to someone with no Zones page to open.
 */
const TABS_FOR: Record<'tenant' | 'internal', readonly Tab[]> = {
  tenant: ALL_TABS,
  internal: ['Account', 'Notifications'],
}

const PREMIUM_UNLOCKS = ['15-minute capture', 'Kota / Lokal roads', 'Unlimited history', 'WebM export + API access']

export function ProfileView({ variant = 'tenant' }: { variant?: 'tenant' | 'internal' }) {
  const { user } = useCurrentUser()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const tabs = TABS_FOR[variant]
  const [tab, setTab] = useState<Tab>(variant === 'internal' ? 'Account' : 'Usage')
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)

  useEffect(() => {
    if (variant === 'internal') return
    dashboardApi.getUsage().then(setUsage)
  }, [variant])

  /**
   * Downgrades only. The server refuses an upgrade with UPGRADE_NOT_SELF_SERVE until
   * billing exists, so the refusal is surfaced rather than left as a button stuck on
   * "Saving…" — which is what happened before, because nothing caught the throw.
   */
  async function changePlan(plan: Plan) {
    setPendingPlan(plan)
    setPlanError(null)
    try {
      await authApi.updatePlan(plan)
      // Reload so the header, limits and quota readouts all pick up the new plan.
      window.location.reload()
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : 'Could not change the plan. Please try again.')
      setPendingPlan(null)
    }
  }

  if (!user || (variant === 'tenant' && !usage)) return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />

  const limits = PLAN_LIMITS[usage?.plan ?? user.plan]

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-center gap-lg">
        <span className="w-14 h-14 rounded-full bg-primary-soft text-[#5A35F3] text-section-title font-bold flex items-center justify-center">
          {(user.fullName || user.email).slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h1 className="text-page-title font-bold text-text-primary">{user.fullName || user.email}</h1>
          <p className="text-body text-text-secondary mt-xs">
            {user.email}
          </p>
        </div>
        <Button variant="secondary" className="ml-auto">
          Edit profile
        </Button>
      </div>

      <div className="flex gap-lg border-b border-border">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={cn(
              'relative pb-md text-body transition-colors',
              tab === item
                ? 'text-text-primary font-semibold after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-primary'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Usage' && usage && (
        <div className="grid grid-cols-1 laptop:grid-cols-[1fr_320px] gap-xl items-start">
          <div className="space-y-lg">
            <Card className="p-lg">
              <h2 className="text-heading-sm text-text-primary mb-lg">Plan usage</h2>
              <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
                <UsageMeter label="Zones" value={usage.zonesCount} max={usage.zonesLimit} />
                <UsageMeter label="Captures today" value={usage.capturesToday} max={usage.capturesLimit} />
                <UsageMeter label="Scheduled frames / day" value={usage.framesPerDay} max={usage.capturesLimit} />
                <UsageMeter label="Active windows" value={usage.schedulesActiveCount} max={usage.schedulesLimit} />
                <UsageMeter label="Storage" value={usage.storageUsedGb} max={usage.storageLimitGb} unit=" GB" />
              </div>
            </Card>

            <Card className="p-lg">
              <h2 className="text-heading-sm text-text-primary mb-md">What your plan includes</h2>
              <dl className="divide-y divide-divider">
                <AttributeRow label="Capture interval" value={limits.captureInterval} />
                <AttributeRow label="History kept" value={limits.historyLabel} />
                <AttributeRow label="Animation export" value={limits.exportLabel} />
                <AttributeRow label="Road classes" value={ROAD_CLASS_LABEL[limits.maxRoadClass]} />
              </dl>
            </Card>
          </div>

          <div className="space-y-lg">
            <Card className="p-lg">
              <p className="text-micro font-semibold uppercase tracking-wide text-text-muted">Current plan</p>
              <p className="text-page-title font-bold text-text-primary mt-xs">{PLAN_LABEL[usage.plan]}</p>
              <p className="text-caption text-text-muted mt-xs">
                {PLAN_PRICE[usage.plan].amount} {PLAN_PRICE[usage.plan].period} · renews 1 Oct
              </p>
              {usage.plan !== 'premium' && (
                <p className="text-caption text-text-secondary mt-lg">
                  Need more room? Contact the Maceut team and we&rsquo;ll move you up — upgrades aren&rsquo;t self-serve
                  while billing is being built.
                </p>
              )}
            </Card>

            {usage.plan !== 'premium' && (
              <Card className="p-lg">
                <p className="text-micro font-semibold uppercase tracking-wide text-text-muted mb-md">Premium unlocks</p>
                <ul className="space-y-sm">
                  {PREMIUM_UNLOCKS.map((item) => (
                    <li key={item} className="flex items-start gap-sm text-body text-text-secondary">
                      <IconCheck className="text-success-icon mt-[3px]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'Billing' && usage && (
        <div className="space-y-lg">
          <p className="text-body text-text-secondary">
            Payments aren&rsquo;t wired up yet, so upgrades are arranged with the Maceut team. You can move down a plan
            here at any time.
          </p>
          <Alert variant="warning">
            Moving down pauses anything over the new plan&rsquo;s limits — zones, capture windows and intervals. Nothing
            is deleted, and it all comes back if you move up again.
          </Alert>
          {planError && <p className="text-caption text-danger-text">{planError}</p>}
          <PlanCards
            selected={usage.plan}
            onSelect={changePlan}
            pendingPlan={pendingPlan}
            disabledPlan={(plan) => PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(usage.plan)}
            actionLabel={(plan) =>
              plan === usage.plan
                ? 'Current plan'
                : PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(usage.plan)
                  ? 'Contact us'
                  : `Move down to ${PLAN_LABEL[plan]}`
            }
          />
        </div>
      )}

      {tab === 'Account' && (
        <div className="space-y-lg">
          <Card className="p-lg">
            <dl className="divide-y divide-divider">
              <AttributeRow label="Full name" value={user.fullName || '—'} />
              <AttributeRow label="Email" value={user.email} />
              <AttributeRow label="Platform role" value={user.role === 'internal' ? 'Internal (Maceut staff)' : 'Customer'} />
            </dl>
          </Card>

          {user.role === 'internal' && (
            <Card className="p-lg">
              <h2 className="text-heading-sm text-text-primary">Internal access</h2>
              <p className="text-body text-text-secondary mt-xs">
                This account is configured for the staff area.
              </p>
              <Link href="/internal" className={cn(buttonClass('secondary'), 'mt-lg')}>
                Open internal tools
              </Link>
            </Card>
          )}
        </div>
      )}

      {tab === 'Notifications' && (
        <Card className="p-lg space-y-md">
          {[
            'Email when a scheduled capture fails',
            'Email when an animation finishes rendering',
            'Weekly summary of zone usage',
          ].map((label, i) => (
            <label key={label} className="flex items-center gap-sm text-body text-text-secondary">
              <Checkbox defaultChecked={i < 2} />
              {label}
            </label>
          ))}
          <p className="text-caption text-text-muted pt-sm border-t border-divider">
            Email notifications do not send in the MVP — these preferences are stored for later.
          </p>
        </Card>
      )}
    </div>
  )
}


