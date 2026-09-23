'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { ZoneStatusPill } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { buttonClass } from '@/components/ui/Button'
import { cn, formatNumber, formatKm } from '@/lib/utils'
import * as dashboardApi from '@/features/dashboard/api'
import * as zonesApi from '@/features/zones/api'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import type { CollectionHealth, UsageSummary } from '@/features/dashboard/api'
import type { Zone } from '@/features/zones/types'

/**
 * How many zones the dashboard lists before deferring to the Zones page.
 *
 * It listed every one, so an account with a dozen pushed Latest captures off the bottom
 * of the page and left the right-hand rail floating beside a column of near-identical
 * rows. The dashboard is a summary; the full list already has its own page with search,
 * sorting and paging.
 */
const ZONES_ON_DASHBOARD = 5

/**
 * When the next capture lands, in words.
 *
 * The API used to send this as a finished sentence, in Indonesian, into an English
 * interface. It now sends the day count and the zone count, and the phrasing happens
 * here — where the rest of the copy already lives.
 */
function nextCaptureNote(health: CollectionHealth): string {
  if (health.nextCaptureInDays === null) {
    return health.zonesCollecting === 0 ? 'No zones collecting yet' : 'Waiting for the next firing to be scheduled'
  }
  const when =
    health.nextCaptureInDays === 0
      ? 'today'
      : health.nextCaptureInDays === 1
        ? 'tomorrow'
        : `in ${health.nextCaptureInDays} days`
  const zones = `${health.zonesCollecting} ${health.zonesCollecting === 1 ? 'zone' : 'zones'}`
  return `${when} · ${zones}`
}

/** Short labels for the strip — a 144px tile is no place for a sentence. */
const CAPTURE_STATUS_SHORT: Record<zonesApi.CaptureStatus, string> = {
  pending: 'Queued',
  processing: 'Collecting',
  done: 'Collected',
  failed: 'Failed',
  skipped_limit: 'Over limit',
  missed: 'Missed',
}

/** "19:27" in WIB — the strip is a timeline, so the clock is what matters. */
function captureTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
    .format(new Date(iso))
    .replace('.', ':')
}

export default function DashboardPage() {
  const { user } = useCurrentUser()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [health, setHealth] = useState<CollectionHealth | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [captures, setCaptures] = useState<zonesApi.RecentCapture[] | null>(null)

  const load = useCallback(async () => {
    const [usage, health] = await Promise.all([dashboardApi.getUsage(), dashboardApi.getCollectionHealth()])
    const zones = await zonesApi.getZones()
    const captures = await zonesApi.getRecentCaptures(12)
    return { usage, health, zones, captures }
  }, [])

  const apply = useCallback((data: Awaited<ReturnType<typeof load>>) => {
    setUsage(data.usage)
    setHealth(data.health)
    setZones(data.zones)
    setCaptures(data.captures)
  }, [])

  useEffect(() => {
    load().then(apply)
  }, [load, apply])

  if (!usage || !user || !health) {
    return (
      <div className="space-y-lg">
        <div className="h-8 w-64 bg-canvas-secondary rounded-md animate-pulse" />
        <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-canvas-secondary rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-canvas-secondary rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-page-title font-bold text-text-primary">Dashboard</h1>
          <p className="text-body text-text-secondary mt-xs">
            {/* Explicit string: JSX collapsed the space before the dash, so this read
                "Hi Table— here's" rather than "Hi Table — here's". */}
            Hi {user.fullName?.split(' ')[0] || user.email}
            {' — '}here&rsquo;s your workspace today.
          </p>
        </div>
        <Link
          href="/zones/new"
          className={buttonClass()}
        >
          New zone
        </Link>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
        <StatTile
          label="Active zones"
          value={usage.zonesCount}
          note={`${Math.max(usage.zonesLimit - usage.zonesCount, 0)} slots left`}
          progress={{ value: usage.zonesCount, max: usage.zonesLimit }}
        />
        <StatTile
          label="Captures today"
          value={usage.capturesToday ?? '—'}
          note={usage.capturesToday === null ? 'Not tracked yet' : `Limit ${usage.capturesLimit} / day`}
          {...(usage.capturesToday !== null
            ? { progress: { value: usage.capturesToday, max: usage.capturesLimit } }
            : {})}
        />
        <StatTile
          label="Frames scheduled"
          value={usage.framesPerDay}
          note={`per day · limit ${usage.capturesLimit}`}
          progress={{ value: usage.framesPerDay, max: usage.capturesLimit }}
        />
        <StatTile
          label="Storage used"
          value={usage.storageUsedGb === null ? '—' : `${usage.storageUsedGb} GB`}
          note={usage.storageUsedGb === null ? `Limit ${usage.storageLimitGb} GB` : `of ${usage.storageLimitGb} GB`}
          {...(usage.storageUsedGb !== null
            ? { progress: { value: usage.storageUsedGb, max: usage.storageLimitGb } }
            : {})}
        />
      </div>

      {/*
        `min-w-0` on the left column is load-bearing, not tidiness. A grid item defaults
        to `min-width: auto`, which refuses to shrink below its content — and the capture
        strip below is eight 144px tiles wide. Without it the 1fr column expands past the
        container and shoves the 340px rail off the side of the screen, taking Collection
        health's values with it.
      */}
      <div className="grid grid-cols-1 laptop:grid-cols-[minmax(0,1fr)_340px] gap-xl items-start">
        <div className="space-y-xl min-w-0">
          {/* Zones */}
          <section>
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-section-title text-text-primary">Your zones</h2>
              <Link href="/zones" className="text-body text-info no-underline hover:underline">
                {zones.length > ZONES_ON_DASHBOARD ? `Manage all ${zones.length}` : 'Manage all'}
              </Link>
            </div>
            {zones.length === 0 ? (
              <EmptyState
                title="No zones yet"
                description="Create your first zone to start collecting traffic conditions."
                action={
                  <Link
                    href="/zones/new"
                    className={buttonClass()}
                  >
                    Create your first zone
                  </Link>
                }
              />
            ) : (
              <ul className="bg-card border border-border rounded-lg divide-y divide-divider">
                {zones.slice(0, ZONES_ON_DASHBOARD).map((zone) => (
                  <li key={zone.id} className="flex items-center justify-between gap-md px-lg py-md">
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-text-primary truncate">{zone.name}</p>
                      <p className="text-caption text-text-muted mt-xs">
                        {zone.cadence ?? 'Not scheduled'}
                        {zone.roadsCount !== null && ` · ${formatNumber(zone.roadsCount)} roads`}
                        {zone.lengthKm !== null && ` · ${formatKm(zone.lengthKm)}`}
                      </p>
                    </div>
                    <ZoneStatusPill status={zone.status} />
                  </li>
                ))}
                  {zones.length > ZONES_ON_DASHBOARD && (
                    <li className="px-lg py-md">
                      <Link href="/zones" className="text-caption text-info no-underline hover:underline">
                        {zones.length - ZONES_ON_DASHBOARD} more{' '}
                        {zones.length - ZONES_ON_DASHBOARD === 1 ? 'zone' : 'zones'}
                      </Link>
                    </li>
                  )}
              </ul>
            )}
          </section>

          {/* Latest captures */}
          <section>
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-section-title text-text-primary">Latest captures</h2>
              <Link href="/studio" className="text-body text-info no-underline hover:underline">
                Open Studio
              </Link>
            </div>
            <div className="bg-card border border-border rounded-lg p-lg">
              {captures === null ? (
                <div className="h-24 bg-canvas-secondary rounded-md animate-pulse" />
              ) : captures.length === 0 ? (
                <p className="text-body text-text-secondary">
                  No cycles yet. A zone collects when one of its capture windows comes round.
                </p>
              ) : (
                <div className="flex gap-md overflow-x-auto pb-xs">
                  {captures.map((capture) => (
                    <Link key={capture.id} href={`/zones/${capture.zoneId}`} className="shrink-0 w-36 no-underline group">
                      <div
                        className={cn(
                          'h-20 rounded-md border flex items-center justify-center transition-colors',
                          capture.status === 'done'
                            ? 'bg-canvas-secondary border-divider group-hover:border-primary'
                            : 'bg-warning-bg/40 border-warning-icon/30'
                        )}
                      >
                        <span className="text-caption text-text-secondary tabular-nums">
                          {capture.status === 'done'
                            ? `${capture.roadsCount === null ? '—' : formatNumber(capture.roadsCount)} roads`
                            : CAPTURE_STATUS_SHORT[capture.status]}
                        </span>
                      </div>
                      <p className="text-caption text-text-primary mt-xs tabular-nums">{captureTime(capture.capturedAt)}</p>
                      <p className="text-micro text-text-muted truncate">{capture.zoneName}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-lg">
          <Card className="p-lg">
            <h2 className="text-heading-sm text-text-primary mb-md">Recent renders</h2>
            {/*
              Animation rendering has no backend yet — no endpoint, no table, no worker. This
              card used to call studioApi.getRenders(), which INVENTED two finished render jobs
              from the account's zone names whenever local storage was empty. It looked like
              history and was fiction, which is worse than an empty card: nobody re-checks a
              number that looks plausible.
            */}
            <p className="text-caption text-text-muted">
              Animation rendering isn&rsquo;t built yet. Captures are collecting in the meantime &mdash; open a zone to
              step through its snapshots.
            </p>
          </Card>

          <Card className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-heading-sm text-text-primary">Collection health</h2>
              <span
                className={`text-micro font-semibold rounded-xs px-sm py-xs ${
                  health.status === 'healthy'
                    ? 'bg-success-bg text-success-text'
                    : health.status === 'degraded'
                      ? 'bg-warning-bg text-warning-text'
                      : 'bg-canvas-secondary text-text-muted'
                }`}
              >
                {health.status === 'healthy' ? 'Healthy' : health.status === 'degraded' ? 'Degraded' : 'Idle'}
              </span>
            </div>
            <dl className="space-y-md">
              <HealthRow
                label="Next capture"
                value={health.nextCaptureAt ?? '—'}
                note={nextCaptureNote(health)}
              />
              <HealthRow
                label="Roads reporting"
                value={health.roadsReporting === null ? '—' : formatNumber(health.roadsReporting)}
                note={health.roadsReporting === null ? 'Waiting on traffic data' : undefined}
              />
              <HealthRow
                label="Missed captures"
                value={health.missedCaptures === null ? '—' : String(health.missedCaptures)}
                note={health.missedCaptures === null ? 'Not tracked yet' : undefined}
              />
              <HealthRow
                label="Peak index"
                value={health.peakIndex === null ? '—' : String(health.peakIndex)}
                note={health.peakIndex === null ? 'Not tracked yet' : `at ${health.peakAt}`}
              />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  note,
  progress,
}: {
  label: string
  value: string | number
  note: string
  progress?: { value: number; max: number }
}) {
  return (
    <Card className="p-lg">
      <p className="text-label text-text-secondary">{label}</p>
      <p className="text-display text-text-primary mt-xs tabular-nums">{value}</p>
      {progress && <ProgressBar value={progress.value} max={progress.max} className="mt-sm" />}
      <p className="text-caption text-text-muted mt-sm">{note}</p>
    </Card>
  )
}

function HealthRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-md">
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="text-right">
        <span className="text-body font-semibold text-text-primary tabular-nums">{value}</span>
        {note && <span className="block text-micro text-text-muted mt-xs">{note}</span>}
      </dd>
    </div>
  )
}

