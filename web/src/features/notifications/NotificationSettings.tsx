'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { linkClass } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Alert } from '@/components/ui/Alert'
import { CardTitle } from '@/components/shared/SectionHeader'
import { ApiError } from '@/types/api'
import * as notificationsApi from './api'

/**
 * Profile → Notifications (NOTIF). One email switch — everything else lives in the bell,
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
        <label htmlFor="email-capture-problems" className="flex items-center justify-between gap-lg cursor-pointer">
          <span className="min-w-0">
            <span className="block text-body font-semibold text-text-primary">Email me if a zone stops collecting</span>
            <span className="block text-caption text-text-muted mt-xs">At most once a day.</span>
          </span>
          <Switch
            id="email-capture-problems"
            checked={prefs?.emailCaptureProblems ?? true}
            onCheckedChange={(v) => void toggle(v)}
            disabled={prefs === null || saving}
            aria-label="Email me if a zone stops collecting"
          />
        </label>
      </Card>

    </div>
  )
}

function StaffNotificationSettings() {
  return (
    <Card className="p-lg space-y-md">
      <CardTitle>HERE budget alerts</CardTitle>
      <p className="text-body text-text-secondary">Sent to the alert email on HERE usage.</p>
      <Link href="/internal/here" className={linkClass()}>
        Set alert email
      </Link>
    </Card>
  )
}
