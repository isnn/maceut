'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { ZoneStatusPill } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import * as dashboardApi from '@/features/dashboard/api'
import * as zonesApi from '@/features/zones/api'
import * as studioApi from '@/features/studio/api'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import type { CollectionHealth, UsageSummary } from '@/features/dashboard/api'
import type { Zone } from '@/features/zones/types'
import type { RenderJob } from '@/features/studio/api'

const RENDER_STATUS_LABEL: Record<RenderJob['status'], string> = {
  ready: 'Siap',
  rendering: 'Render',
  failed: 'Gagal',
}

export default function DashboardPage() {
  const { user } = useCurrentUser()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [health, setHealth] = useState<CollectionHealth | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [renders, setRenders] = useState<RenderJob[]>([])

  const load = useCallback(async () => {
    const [usage, health] = await Promise.all([dashboardApi.getUsage(), dashboardApi.getCollectionHealth()])
    const zones = await zonesApi.getZones(usage.plan)
    const renders = await studioApi.getRenders(Object.fromEntries(zones.map((z) => [z.id, z.name])))
    return { usage, health, zones, renders }
  }, [])

  const apply = useCallback((data: Awaited<ReturnType<typeof load>>) => {
    setUsage(data.usage)
    setHealth(data.health)
    setZones(data.zones)
    setRenders(data.renders)
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

  const captureTimes = Array.from({ length: 5 }, (_, i) => `${String(9 - i).padStart(2, '0')}:00`)
  const remainingCaptures = Math.max(usage.capturesToday - captureTimes.length, 0)

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-page-title font-bold text-text-primary">Dashboard</h1>
          <p className="text-body text-text-secondary mt-xs">
            Halo {user.fullName?.split(' ')[0] || user.email} — ini kondisi workspace Anda hari ini.
          </p>
        </div>
        <Link
          href="/zones/new"
          className="h-11 px-lg inline-flex items-center bg-primary hover:bg-primary-hover text-on-primary font-semibold rounded-md no-underline transition-colors"
        >
          Zona baru
        </Link>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
        <StatTile
          label="Zona aktif"
          value={usage.zonesCount}
          note={`${Math.max(usage.zonesLimit - usage.zonesCount, 0)} slot tersisa`}
          progress={{ value: usage.zonesCount, max: usage.zonesLimit }}
        />
        <StatTile
          label="Capture hari ini"
          value={usage.capturesToday}
          note={`Batas ${usage.capturesLimit} / hari`}
          progress={{ value: usage.capturesToday, max: usage.capturesLimit }}
        />
        <StatTile label="Animasi ter-render" value={usage.rendersThisMonth} note="Bulan ini" />
        <StatTile
          label="Penyimpanan"
          value={`${usage.storageUsedGb} GB`}
          note={`dari ${usage.storageLimitGb} GB`}
          progress={{ value: usage.storageUsedGb, max: usage.storageLimitGb }}
        />
      </div>

      <div className="grid grid-cols-1 laptop:grid-cols-[1fr_340px] gap-xl items-start">
        <div className="space-y-xl">
          {/* Zones */}
          <section>
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-section-title text-text-primary">Zona Anda</h2>
              <Link href="/zones" className="text-body text-info no-underline hover:underline">
                Kelola semua
              </Link>
            </div>
            {zones.length === 0 ? (
              <EmptyState
                title="Belum ada zona"
                description="Buat zona pertama Anda untuk mulai mengumpulkan kondisi lalu lintas."
                action={
                  <Link
                    href="/zones/new"
                    className="h-11 px-lg inline-flex items-center bg-primary hover:bg-primary-hover text-on-primary font-semibold rounded-md no-underline"
                  >
                    Buat zona pertama
                  </Link>
                }
              />
            ) : (
              <ul className="bg-card border border-border rounded-lg divide-y divide-divider">
                {zones.map((zone) => (
                  <li key={zone.id} className="flex items-center justify-between gap-md px-lg py-md">
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-text-primary truncate">{zone.name}</p>
                      <p className="text-caption text-text-muted mt-xs">
                        {zone.cadence} · {zone.roadsCount} ruas · {zone.lengthKm} km
                      </p>
                    </div>
                    <ZoneStatusPill status={zone.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Latest captures */}
          <section>
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-section-title text-text-primary">Capture terakhir</h2>
              <Link href="/studio" className="text-body text-info no-underline hover:underline">
                Buka Studio
              </Link>
            </div>
            <div className="bg-card border border-border rounded-lg p-lg">
              <div className="flex gap-md overflow-x-auto">
                {captureTimes.map((time) => (
                  <div key={time} className="shrink-0 w-32">
                    <div className="h-20 rounded-md bg-canvas-secondary border border-divider" />
                    <p className="text-caption text-text-secondary mt-xs tabular-nums">{time}</p>
                  </div>
                ))}
                {remainingCaptures > 0 && (
                  <div className="shrink-0 w-24 h-20 rounded-md bg-canvas-secondary border border-divider flex items-center justify-center text-body font-semibold text-text-muted tabular-nums">
                    +{remainingCaptures}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-lg">
          <Card className="p-lg">
            <h2 className="text-heading-sm text-text-primary mb-md">Render terbaru</h2>
            <ul className="space-y-md">
              {renders.length === 0 && <li className="text-caption text-text-muted">Belum ada animasi di-render.</li>}
              {renders.map((render) => (
                <li key={render.id}>
                  <div className="flex items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label font-medium text-text-primary truncate">{render.title}</p>
                      <p className="text-micro text-text-muted mt-xs">
                        {render.frames} frame · {render.format.toUpperCase()}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-micro font-semibold rounded-xs px-sm py-xs shrink-0',
                        render.status === 'ready' ? 'bg-success-bg text-success-text' : 'bg-warning-bg text-warning-text'
                      )}
                    >
                      {RENDER_STATUS_LABEL[render.status]}
                    </span>
                  </div>
                  {render.status === 'rendering' && (
                    <div className="mt-sm">
                      <ProgressBar value={render.progress} max={100} />
                      <p className="text-micro text-text-muted mt-xs">{render.progress}% selesai</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-heading-sm text-text-primary">Kesehatan koleksi</h2>
              <span className="bg-success-bg text-success-text text-micro font-semibold rounded-xs px-sm py-xs">Sehat</span>
            </div>
            <dl className="space-y-md">
              <HealthRow label="Capture berikutnya" value={health.nextCaptureAt} note={health.nextCaptureIn} />
              <HealthRow label="Ruas melapor" value={`${health.roadsReporting} dari ${health.roadsTotal}`} />
              <HealthRow label="Capture terlewat" value={health.missedCaptures} />
              <HealthRow label="Indeks puncak" value={String(health.peakIndex)} note={`pada ${health.peakAt}`} />
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

