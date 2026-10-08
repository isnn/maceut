'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/Badge'
import { IconClock } from '@/components/ui/icons'
import type { CaptureWindow } from '../types'
import type { Zone } from '@/features/zones/types'

/** The interval as a phrase, the same words as the Zones table. */
const EVERY = { '15min': 'every 15 min', hourly: 'hourly', daily: 'daily' } as const

/** "06:00" in WIB. */
function clockWib(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(d)
}

/** Whole days between two instants on Jakarta's calendar. */
function wibDaysBetween(from: Date, to: Date): number {
  const day = (d: Date) => Math.floor((d.getTime() + 7 * 3600_000) / 86_400_000)
  return day(to) - day(from)
}

/** "in 21 min", "in 2 h 5 min" — for the hours ahead; beyond a day the date says it. */
function countdown(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 1) return 'any moment now'
  if (minutes < 60) return `in ${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `in ${h} h ${m} min` : `in ${h} h`
}

/**
 * When the scheduler fires next, from each window's `nextFireAt` — the instant the
 * scheduler itself claims, not a prediction. Ticks every 30 s so the countdown stays
 * true while the page is open.
 */
export function NextCollectionCard({ windows, zones }: { windows: CaptureWindow[]; zones: Zone[] }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const upcoming = windows
    .filter((w) => w.active && w.nextFireAt)
    .map((w) => ({ w, at: Date.parse(w.nextFireAt!) }))
    .sort((a, b) => a.at - b.at)
  const first = upcoming[0]

  const header = (badge?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-sm">
      <div className="flex items-center gap-sm">
        <span aria-hidden className="w-8 h-8 rounded-md bg-primary-soft text-primary flex items-center justify-center">
          <IconClock size={16} />
        </span>
        <p className="text-heading-sm text-text-primary">Next collection</p>
      </div>
      {badge}
    </div>
  )

  if (!first) {
    const pending = windows.some((w) => w.active)
    return (
      <Card className="p-lg space-y-md">
        {header()}
        <p className="text-body text-text-secondary">
          {pending ? 'Being scheduled — this updates in a moment.' : 'No active capture window. Add one to start collecting.'}
        </p>
      </Card>
    )
  }

  const at = new Date(first.at)
  const days = wibDaysBetween(new Date(now), at)
  const together = upcoming.filter((u) => u.at === first.at)
  const after = upcoming.find((u) => u.at > first.at)
  const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
    .format(at)
    .replace('Sept', 'Sep')
  const badge =
    days <= 0 ? countdown(first.at - now) : days === 1 ? 'Tomorrow' : dayLabel

  return (
    <Card className="p-lg space-y-md">
      {header(<StatusPill tone="brand">{badge}</StatusPill>)}

      <div>
        <p className="text-display text-text-primary tabular-nums leading-none">
          {clockWib(at)}
          <span className="text-heading-sm font-medium text-text-muted ml-xs">WIB</span>
        </p>
        <p className="text-caption text-text-muted mt-sm">
          {days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'On'} · {dayLabel}
        </p>
      </div>

      <div className="border-t border-divider pt-md space-y-sm">
        <p className="text-micro font-semibold uppercase tracking-wide text-text-muted">
          {together.length === 1 ? 'Window firing' : `${together.length} windows firing`}
        </p>
        <ul className="space-y-sm">
          {together.slice(0, 3).map(({ w }) => (
            <li key={w.id} className="flex items-baseline justify-between gap-md min-w-0">
              <span className="text-label font-semibold text-text-primary truncate">
                {zones.find((z) => z.id === w.zoneId)?.name ?? 'Zone'}
              </span>
              <span className="text-caption text-text-secondary whitespace-nowrap">
                {w.label} · {EVERY[w.interval]}
              </span>
            </li>
          ))}
          {together.length > 3 && <li className="text-caption text-text-muted">and {together.length - 3} more</li>}
        </ul>
      </div>

      {after && (
        <div className="border-t border-divider pt-md flex items-center justify-between gap-md">
          <span className="text-caption text-text-muted">After that</span>
          <span className="text-label font-semibold text-text-primary tabular-nums">{clockWib(new Date(after.at))} WIB</span>
        </div>
      )}
    </Card>
  )
}
