'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Switch'
import { PLAN_LABEL } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { ApiError } from '@/types/api'
import type { Plan } from '@/features/auth/types'
import * as billingApi from './api'

/**
 * Auto-renew (FE-56 phase 5), off by default and shown only when the server offers it.
 *
 * Only a card can be charged without the customer present — QRIS, bank transfer and
 * e-wallets can't — so turning it on is a card payment for the next period that saves
 * the card; Midtrans then renews monthly. Turning it off cancels at Midtrans first.
 */
export function AutoRenewCard({
  plan,
  on,
  periodEnd,
  price,
  busy,
  onEnable,
}: {
  plan: Plan
  on: boolean
  periodEnd: string | null
  price: string
  busy: boolean
  onEnable: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = 'auto-renew-switch'

  async function toggle(next: boolean) {
    setError(null)
    if (next) return onEnable()
    setSaving(true)
    try {
      await billingApi.disableAutoRenew()
      window.location.reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t turn auto-renew off. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Card className="p-lg space-y-md">
      <div className="flex items-center justify-between gap-lg">
        <label htmlFor={id} className="text-heading-sm text-text-primary cursor-pointer">
          Auto-renew
        </label>
        <Switch id={id} checked={on} onCheckedChange={(v) => void toggle(v)} disabled={busy || saving} aria-label="Auto-renew" />
      </div>
      <p className="text-caption text-text-muted">
        {on
          ? `${PLAN_LABEL[plan]} renews every month with your saved card, ${price}.${periodEnd ? ` Next charge around ${formatDate(periodEnd)}.` : ''}`
          : `Renew ${PLAN_LABEL[plan]} automatically with a card. Turning it on pays the next 30 days now (${price}) and saves the card.`}
      </p>
      {error && <p className="text-caption text-danger-text">{error}</p>}
    </Card>
  )
}
