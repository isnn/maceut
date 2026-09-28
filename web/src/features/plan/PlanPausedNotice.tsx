'use client'

import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'

/**
 * The standing "paused by your plan" notice (ADR-020): after a downgrade, the zones and
 * capture windows over the new limits are paused — and without saying so, a zone that
 * simply stopped collecting looks broken. Shown on the dashboard, zones list and
 * schedule, wherever the paused items would otherwise just sit there.
 */
export function PlanPausedNotice({
  zones,
  windows,
}: {
  zones: { id: string; name: string }[]
  windows: { id: string; label: string }[]
}) {
  if (zones.length === 0 && windows.length === 0) return null
  const parts = [
    zones.length ? `${zones.length} zone${zones.length === 1 ? '' : 's'}` : null,
    windows.length ? `${windows.length} capture window${windows.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean)

  return (
    <Alert variant="warning">
      <p className="font-semibold">
        {parts.join(' and ')} {zones.length + windows.length === 1 ? 'is' : 'are'} paused by your plan change.
      </p>
      <p className="mt-xs">
        {[...zones.map((z) => z.name), ...windows.map((w) => w.label)].slice(0, 5).join(', ')}
        {zones.length + windows.length > 5 ? `, and ${zones.length + windows.length - 5} more` : ''}. Nothing was
        deleted. They&rsquo;re over your current plan&rsquo;s limits — pause something else to make room, or{' '}
        <Link href="/profile" className="font-semibold underline">
          change your plan
        </Link>{' '}
        to resume them.
      </p>
    </Alert>
  )
}
