'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Switch'
import { Alert } from '@/components/ui/Alert'
import { CardTitle } from '@/components/shared/SectionHeader'
import { ApiError } from '@/types/api'
import * as notificationsApi from './api'

/** What always lands in the bell — listed so "one email switch" doesn't read as "few notifications". */
const IN_APP = [
  'A zone stops collecting, and when it recovers',
  'Captures missed while Maceut was unavailable',
  'Reaching 80% and 100% of your daily captures',
  'Exports that finish or fail',
  'Changes to your plan',
]

/**
 * Profile → Notifications (NOTIF). One email switch: everything else is in the app,
 * which costs nothing and doesn't fill an inbox.
 */
export function NotificationSettings({ variant }: { variant: 'tenant' | 'internal' }) {
  if (variant === 'internal') return <StaffNotificationSettings />
  return <CustomerNotificationSettings />
}

function CustomerNotificationSettings() {
  const [prefs, setPrefs] = useState<notificationsApi.NotificationPreferences | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    notificationsApi
      .getPreferences()
      .then(setPrefs)
      .catch(() => setError('Could not load your notification settings.'))
  }, [])

  async function toggle(next: boolean) {
    if (!prefs) return
    const previous = prefs
    setPrefs({ ...prefs, emailCaptureProblems: next })
    setSaving(true)
    setError(null)
    try {
      setPrefs(await notificationsApi.updatePreferences({ emailCaptureProblems: next }))
    } catch (err) {
      setPrefs(previous)
      setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-lg">
      {error && <Alert variant="warning">{error}</Alert>}

      <Card className="p-lg space-y-md">
        <CardTitle>Email</CardTitle>
        <label htmlFor="email-capture-problems" className="flex items-start justify-between gap-lg cursor-pointer">
          <span className="min-w-0">
            <span className="block text-body font-semibold text-text-primary">Email me if captures keep failing</span>
            <span className="block text-caption text-text-muted mt-xs">
              Only when a zone is still failing 2 hours later and you haven&rsquo;t seen it in the app. Several zones
              come as one email, at most one a day.
            </span>
          </span>
          <Switch
            id="email-capture-problems"
            checked={prefs?.emailCaptureProblems ?? true}
            onCheckedChange={(v) => void toggle(v)}
            disabled={prefs === null || saving}
            aria-label="Email me if captures keep failing"
          />
        </label>
        <p className="text-caption text-text-muted pt-md border-t border-divider">
          Sign-in codes, password resets and plan changes made by the Maceut team are always emailed.
        </p>
      </Card>

      <Card className="p-lg space-y-md">
        <CardTitle>In the app</CardTitle>
        <p className="text-caption text-text-muted">These appear under the bell at the top of every page.</p>
        <ul className="space-y-sm">
          {IN_APP.map((item) => (
            <li key={item} className="text-body text-text-secondary flex gap-sm">
              <span aria-hidden className="mt-[9px] w-1.5 h-1.5 rounded-full bg-text-muted shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function StaffNotificationSettings() {
  return (
    <Card className="p-lg space-y-md">
      <CardTitle>HERE budget alerts</CardTitle>
      <p className="text-body text-text-secondary">
        When HERE usage reaches 80% of a cap, and when a cap is reached, every staff account sees it under the bell. One
        email goes to the alert address set on the HERE usage page.
      </p>
      <Link href="/internal/here" className="text-body text-info font-medium no-underline hover:underline">
        Set the alert address →
      </Link>
    </Card>
  )
}
