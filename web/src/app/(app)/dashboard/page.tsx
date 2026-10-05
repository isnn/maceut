'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { StatusPill, ZoneStatusPill } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { buttonClass, linkClass } from '@/components/ui/Button'
import { IconAlert, IconCarFront, IconClock, IconFilm, IconRoad, IconZap } from '@/components/ui/icons'
import { cn, formatFileSize, formatKm, formatNumber } from '@/lib/utils'
import { PLAN_LABEL, TRAFFIC_COLORS } from '@/lib/constants'
import * as dashboardApi from '@/features/dashboard/api'
import * as zonesApi from '@/features/zones/api'
import * as exportsApi from '@/features/exports/api'
import { ExportPill } from '@/features/exports/components/ExportProgress'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import type { CollectionHealth, UsageSummary } from '@/features/dashboard/api'
import type { Zone } from '@/features/zones/types'
import { PlanPausedNotice } from '@/features/plan/PlanPausedNotice'

/**
 * The dashboard (F-19): how collection is going, at a glance.
 *
 * Every number on it is measured — captures, storage (capture images plus export files
 * in R2), exports this month, today's failures and peak congestion. None is estimated:
 * a dashboard is believed without being checked, so an invented figure is worse than
 * none.
 */

/** Zones listed before deferring to the Zones page — this is a summary, not the list. */
const ZONES_ON_DASHBOARD = 5
const CAPTURES_ON_DASHBOARD = 12
const EXPORTS_ON_DASHBOARD = 4

/** "Good morning" by the clock in Jakarta, not the browser's. */
function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(now))
  return hour < 11 ? 'Good morning' : hour < 15 ? 'Good afternoon' : hour < 19 ? 'Good evening' : 'Good night'
}

/** One line under the greeting: the single most useful thing to know right now. */
function headline(health: CollectionHealth): string {
  if (health.zonesFailing > 0) {
    return `${health.zonesFailing} ${health.zonesFailing === 1 ? 'zone has' : 'zones have'} stopped collecting — we keep retrying at every scheduled time.`
  }
  if (health.status === 'idle') return 'Nothing is scheduled yet. Add a capture window to start collecting.'
  const zones = `${health.zonesCollecting} ${health.zonesCollecting === 1 ? 'zone is' : 'zones are'} collecting`
  return health.nextCaptureAt ? `${zones}. Next capture at ${health.nextCaptureAt} WIB ${dayWord(health.nextCaptureInDays)}.` : `${zones}.`
}

function dayWord(days: number | null): string {
  if (days === null || days === 0) return 'today'
  return days === 1 ? 'tomorrow' : `in ${days} days`
}

/** Short labels for the strip — a small tile is no place for a sentence. */
const CAPTURE_STATUS_SHORT: Record<zonesApi.CaptureStatus, string> = {
  pending: 'Queued',
  processing: 'Collecting…',
  done: 'Collected',
  failed: 'Failed',
  skipped_limit: 'Over daily limit',
  missed: 'Missed',
}

/** "19:27" in WIB — the strip is a timeline, so the clock is what matters. */
function clockWib(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(
    new Date(iso),
  )
}

/** BR-017's bands, for the colour beside a jam factor. */
function jamColor(value: number): string {
  return value >= 8 ? TRAFFIC_COLORS.congested! : value >= 6 ? TRAFFIC_COLORS.heavy! : value >= 4 ? TRAFFIC_COLORS.slow! : TRAFFIC_COLORS.normal!
}

interface DashboardData {
  usage: UsageSummary
  zones: Zone[]
  captures: zonesApi.RecentCapture[]
  exports: exportsApi.ExportJob[]
}

export default function DashboardPage() {
  const { user } = useCurrentUser()
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    // One request per source. Health rides inside /usage — it used to be fetched twice.
    Promise.all([
      dashboardApi.getUsage(),
      zonesApi.getZones(),
      zonesApi.getRecentCaptures(CAPTURES_ON_DASHBOARD),
      exportsApi.getRecentExports(EXPORTS_ON_DASHBOARD).catch(() => []),
    ]).then(([usage, zones, captures, exports]) => setData({ usage, zones, captures, exports }))
  }, [])

  if (!data || !user) {
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

  const { usage, zones, captures, exports } = data
  const health = usage.health
  const firstName = user.fullName?.split(' ')[0] || user.email
  const storageLimitBytes = usage.storageLimitGb * 1024 ** 3

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="min-w-0">
          <h1 className="text-page-title font-bold text-text-primary">
            {greeting()}, {firstName}
          </h1>
          <p className="text-body text-text-secondary mt-xs">{headline(health)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          <Link href="/studio" className={buttonClass('ink')}>
            <IconFilm size={18} />
            Open Studio
          </Link>
          <Link href="/zones/new" className={buttonClass()}>
            New zone
          </Link>
        </div>
      </div>

      <PlanPausedNotice zones={zones.filter((z) => z.status === 'paused' && z.pausedByPlan)} windows={[]} />

      <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
        <StatTile
          label="Zones collecting"
          value={formatNumber(usage.zonesCount)}
          note={`of ${usage.zonesLimit} on ${PLAN_LABEL[usage.plan]} · ${Math.max(usage.zonesLimit - usage.zonesCount, 0)} left`}
          progress={{ value: usage.zonesCount, max: usage.zonesLimit }}
        />
        <StatTile
          label="Captures today"
          value={usage.capturesToday === null ? '—' : formatNumber(usage.capturesToday)}
          note={`of ${formatNumber(usage.capturesLimit)} a day · resets 00:00 WIB`}
          progress={usage.capturesToday === null ? undefined : { value: usage.capturesToday, max: usage.capturesLimit }}
        />
        <StatTile
          label="Scheduled per day"
          value={formatNumber(usage.framesPerDay)}
          note={`captures on your busiest day · limit ${formatNumber(usage.capturesLimit)}`}
          progress={{ value: usage.framesPerDay, max: usage.capturesLimit }}
        />
        <StatTile
          label="Storage"
          value={formatFileSize(usage.storageUsedBytes)}
          note={`of ${usage.storageLimitGb} GB · capture images and exports`}
          progress={{ value: usage.storageUsedBytes, max: storageLimitBytes }}
        />
      </div>

      {/*
        `min-w-0` on the left column is load-bearing: a grid item won't shrink below its
        content, and the capture strip is wider than the column. Without it the 1fr
        column pushes the 340px rail off the side of the screen.
      */}
      <div className="grid grid-cols-1 laptop:grid-cols-[minmax(0,1fr)_340px] gap-xl items-start">
        <div className="space-y-xl min-w-0">
          <section>
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-section-title text-text-primary">Your zones</h2>
              <Link href="/zones" className={linkClass()}>
                {zones.length > ZONES_ON_DASHBOARD ? `See all ${zones.length}` : 'See all'}
              </Link>
            </div>
            {zones.length === 0 ? (
              <EmptyState
                title="No zones yet"
                description="Draw an area on the map and choose which roads to watch — traffic collection starts from its first capture window."
                action={
                  <Link href="/zones/new" className={buttonClass()}>
                    Create your first zone
                  </Link>
                }
              />
            ) : (
              <ul className="bg-card border border-border rounded-lg divide-y divide-divider">
                {zones.slice(0, ZONES_ON_DASHBOARD).map((zone) => (
                  <li key={zone.id}>
                    <Link
                      href={`/zones/${zone.id}`}
                      className="flex items-center justify-between gap-md px-lg py-md no-underline hover:bg-canvas-secondary/60 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-body font-semibold text-text-primary truncate">{zone.name}</p>
                        <p className="text-caption text-text-muted mt-xs">
                          {zone.cadence ?? 'No capture window yet'}
                          {zone.roadsCount !== null && ` · ${formatNumber(zone.roadsCount)} roads`}
                          {zone.lengthKm !== null && ` · ${formatKm(zone.lengthKm)}`}
                        </p>
                      </div>
                      <ZoneStatusPill status={zone.status} pausedByPlan={zone.pausedByPlan} />
                    </Link>
                  </li>
                ))}
                {zones.length > ZONES_ON_DASHBOARD && (
                  <li className="px-lg py-md">
                    <Link href="/zones" className={linkClass('caption')}>
                      {zones.length - ZONES_ON_DASHBOARD} more
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-section-title text-text-primary">Latest captures</h2>
              <Link href="/studio" className={linkClass()}>
                Open Studio
              </Link>
            </div>
            <div className="bg-card border border-border rounded-lg p-lg">
              {captures.length === 0 ? (
                <p className="text-body text-text-secondary">
                  No captures yet. Each zone collects when one of its capture windows comes round — or press Capture now
                  on a zone.
                </p>
              ) : (
                <div className="flex gap-md overflow-x-auto pb-xs">
                  {captures.map((capture) => (
                    <CaptureThumb key={capture.id} capture={capture} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-lg">
          <Card className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-heading-sm text-text-primary">Collection health</h2>
              <StatusPill tone={health.status === 'healthy' ? 'success' : health.status === 'degraded' ? 'warning' : 'neutral'}>
                {health.status === 'healthy' ? 'Healthy' : health.status === 'degraded' ? 'Needs attention' : 'Idle'}
              </StatusPill>
            </div>
            {/* One line each — the label says what it is, the value says how it is. The
                explanations that used to sit under every value read as fine print. */}
            <dl className="divide-y divide-divider">
              <HealthRow icon={<IconClock size={16} />} label="Next capture">
                {health.nextCaptureAt ? (
                  <>
                    {health.nextCaptureAt}
                    <span className="text-caption font-normal text-text-muted ml-xs">{dayWord(health.nextCaptureInDays)}</span>
                  </>
                ) : (
                  <span className="text-text-muted">Not scheduled</span>
                )}
              </HealthRow>
              <HealthRow icon={<IconAlert size={16} />} label="Zones failing" tone={health.zonesFailing > 0 ? 'warning' : 'ok'}>
                {health.zonesFailing}
              </HealthRow>
              <HealthRow
                icon={<IconZap size={16} />}
                label="Problems today"
                tone={health.problemsToday.failed + health.problemsToday.missed > 0 ? 'warning' : 'ok'}
              >
                <span title={`${health.problemsToday.failed} failed · ${health.problemsToday.missed} missed while offline`}>
                  {health.problemsToday.failed + health.problemsToday.missed}
                </span>
              </HealthRow>
              <HealthRow icon={<IconCarFront size={16} />} label="Peak today">
                {health.peakIndex === null ? (
                  <span className="text-text-muted">—</span>
                ) : (
                  <span className="inline-flex items-center gap-xs" title={`Avg jam factor at ${health.peakAt} WIB in ${health.peakZoneName}`}>
                    <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: jamColor(health.peakIndex) }} />
                    {health.peakIndex.toFixed(1)}
                    <span className="text-caption font-normal text-text-muted">at {health.peakAt}</span>
                  </span>
                )}
              </HealthRow>
              <HealthRow icon={<IconRoad size={16} />} label="Roads watched">
                {health.roadsReporting === null ? <span className="text-text-muted">—</span> : formatNumber(health.roadsReporting)}
              </HealthRow>
            </dl>
          </Card>

          <Card className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-heading-sm text-text-primary">Recent exports</h2>
              <span className="text-caption text-text-muted tabular-nums">{usage.exportsThisMonth} this month</span>
            </div>
            {exports.length === 0 ? (
              <p className="text-caption text-text-muted">
                No exports yet. In Studio, turn a day of captures into a ZIP of frames or a WebM animation — it renders here
                while you do something else.
              </p>
            ) : (
              <ul className="space-y-md">
                {exports.map((job) => (
                  <li key={job.id} className="flex items-start justify-between gap-md">
                    <Link href={`/zones/${job.zoneId}?export=${job.id}#exports`} className="min-w-0 no-underline group">
                      <p className="text-label font-semibold text-text-primary truncate group-hover:text-primary transition-colors">
                        {job.zoneName}
                      </p>
                      <p className="text-micro text-text-muted mt-[2px]">
                        {job.format === 'webm' ? 'WebM' : 'ZIP'} · {job.frameCount} frames
                      </p>
                    </Link>
                    <ExportPill job={job} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * One capture in the strip: its small JPEG (CAP-02) when it has one. Older captures,
 * rendered before thumbnails existed, 404 on the thumbnail link and fall back to the
 * plain tile — so does anything that wasn't collected.
 */
function CaptureThumb({ capture }: { capture: zonesApi.RecentCapture }) {
  const [broken, setBroken] = useState(false)
  const showImage = capture.thumbnailUrl !== null && !broken
  const done = capture.status === 'done'

  return (
    <Link href={`/zones/${capture.zoneId}`} className="shrink-0 w-40 no-underline group">
      <div
        className={cn(
          'relative aspect-video rounded-md border overflow-hidden flex items-center justify-center transition-colors',
          done ? 'bg-text-primary border-divider group-hover:border-primary' : 'bg-warning-bg/40 border-warning-icon/30',
        )}
      >
        {showImage ? (
          // A plain <img>: the link is signed and expires, so Next's image optimiser would
          // only cache a URL that stops working.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capture.thumbnailUrl!}
            alt={`${capture.zoneName} at ${clockWib(capture.capturedAt)} WIB`}
            loading="lazy"
            onError={() => setBroken(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={cn('text-caption tabular-nums', done ? 'text-on-primary/80' : 'text-text-secondary')}>
            {done ? `${capture.roadsCount === null ? '—' : formatNumber(capture.roadsCount)} roads` : CAPTURE_STATUS_SHORT[capture.status]}
          </span>
        )}
        {done && capture.jamFactorAvg !== null && (
          <span className="absolute bottom-xs left-xs inline-flex items-center gap-[3px] rounded-full bg-black/60 px-xs text-micro text-on-primary tabular-nums">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: jamColor(capture.jamFactorAvg) }} />
            {capture.jamFactorAvg.toFixed(1)}
          </span>
        )}
      </div>
      <p className="text-caption text-text-primary mt-xs tabular-nums">{clockWib(capture.capturedAt)} WIB</p>
      <p className="text-micro text-text-muted truncate">{capture.zoneName}</p>
    </Link>
  )
}

function StatTile({
  label,
  value,
  note,
  progress,
}: {
  label: string
  value: string
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

function HealthRow({
  icon,
  label,
  tone,
  children,
}: {
  icon: React.ReactNode
  label: string
  /** `warning` turns the value amber; `ok` marks a zero that is good news. */
  tone?: 'warning' | 'ok'
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-md py-sm first:pt-0 last:pb-0">
      <dt className="flex items-center gap-sm text-body text-text-secondary">
        <span aria-hidden className="text-primary">
          {icon}
        </span>
        {label}
      </dt>
      <dd
        className={cn(
          'text-body font-semibold tabular-nums text-right',
          tone === 'warning' ? 'text-warning-text' : tone === 'ok' ? 'text-success-text' : 'text-text-primary',
        )}
      >
        {children}
      </dd>
    </div>
  )
}
