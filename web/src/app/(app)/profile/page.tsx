'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Checkbox } from '@/components/ui/Input'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { cn } from '@/lib/utils'
import { IconCheck } from '@/components/ui/icons'
import { PLAN_LABEL, PLAN_LIMITS, PLAN_PRICE, ROAD_CLASS_LABEL } from '@/lib/constants'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as authApi from '@/features/auth/api'
import * as dashboardApi from '@/features/dashboard/api'
import type { UsageSummary } from '@/features/dashboard/api'
import type { Plan } from '@/features/auth/types'

const TABS = ['Usage', 'Account', 'Billing', 'Notifications'] as const
type Tab = (typeof TABS)[number]

const PREMIUM_UNLOCKS = ['15-minute capture', 'Kota / Lokal roads', 'Unlimited history', 'WebM export + API access']

export default function ProfilePage() {
  const { user } = useCurrentUser()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [tab, setTab] = useState<Tab>('Usage')
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null)

  useEffect(() => {
    dashboardApi.getUsage().then(setUsage)
  }, [])

  async function changePlan(plan: Plan) {
    setPendingPlan(plan)
    await authApi.updatePlan(plan)
    // Reload so the header, limits and quota readouts all pick up the new plan.
    window.location.reload()
  }

  if (!user || !usage) return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />

  const limits = PLAN_LIMITS[usage.plan]

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-center gap-lg">
        <span className="w-14 h-14 rounded-full bg-primary-soft text-[#5A35F3] text-section-title font-bold flex items-center justify-center">
          {(user.fullName || user.email).slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h1 className="text-page-title font-bold text-text-primary">{user.fullName || user.email}</h1>
          <p className="text-body text-text-secondary mt-xs">
            {user.email} · Owner{user.organisation && ` · ${user.organisation}`}
          </p>
        </div>
        <Button variant="secondary" className="ml-auto">
          Edit profile
        </Button>
      </div>

      <div className="flex gap-lg border-b border-border">
        {TABS.map((item) => (
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

      {tab === 'Usage' && (
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
                <UsageMeter label="Team seats" value={usage.seatsUsed} max={usage.seatsLimit} />
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
                <Button className="w-full mt-lg" onClick={() => changePlan(usage.plan === 'free' ? 'standard' : 'premium')}>
                  {pendingPlan ? 'Saving…' : `Upgrade to ${usage.plan === 'free' ? 'Standard' : 'Premium'}`}
                </Button>
              )}
              <button className="w-full text-label text-text-secondary hover:text-text-primary mt-md transition-colors">
                Manage billing
              </button>
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

      {tab === 'Billing' && (
        <div className="space-y-lg">
          <p className="text-body text-text-secondary">
            Payments are not wired up in the MVP — pick a plan below to simulate a plan change.
          </p>
          <PlanCards
            selected={usage.plan}
            onSelect={changePlan}
            pendingPlan={pendingPlan}
            actionLabel={(plan) => (plan === usage.plan ? 'Current plan' : `Switch to ${PLAN_LABEL[plan]}`)}
          />
        </div>
      )}

      {tab === 'Account' && (
        <Card className="p-lg">
          <dl className="divide-y divide-divider">
            <AttributeRow label="Full name" value={user.fullName || '—'} />
            <AttributeRow label="Email" value={user.email} />
            <AttributeRow label="Organisation" value={user.organisation || '—'} />
            <AttributeRow label="Role" value="Owner" />
          </dl>
        </Card>
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

function UsageMeter({ label, value, max, unit = '' }: { label: string; value: number; max: number; unit?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-sm">
        <span className="text-label text-text-secondary">{label}</span>
        <span className="text-body font-semibold text-text-primary tabular-nums">
          {value}
          {unit} / {max}
          {unit}
        </span>
      </div>
      <ProgressBar value={value} max={max} className="mt-sm" />
    </div>
  )
}

function AttributeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-md py-md first:pt-0 last:pb-0">
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="text-body font-semibold text-text-primary">{value}</dd>
    </div>
  )
}
