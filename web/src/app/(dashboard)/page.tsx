'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as dashboardApi from '@/features/dashboard/api'
import * as zonesApi from '@/features/zones/api'
import type { UsageSummary } from '@/features/dashboard/api'

const ZoneCreateStepper = dynamic(
  () => import('@/features/zones/components/ZoneCreateStepper').then((m) => m.ZoneCreateStepper),
  { ssr: false }
)

export default function DashboardPage() {
  const { user } = useCurrentUser()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [zoneNames, setZoneNames] = useState<string[]>([])
  const [stepperOpen, setStepperOpen] = useState(false)

  const refetch = useCallback(() => {
    dashboardApi.getUsage().then(setUsage)
    zonesApi.getZones().then((zones) => setZoneNames(zones.map((z) => z.name)))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  if (!usage || !user) {
    return (
      <div className="space-y-md">
        <div className="h-8 w-64 bg-canvas-secondary rounded-md animate-pulse" />
        <div className="grid grid-cols-2 gap-lg">
          <div className="h-28 bg-canvas-secondary rounded-lg animate-pulse" />
          <div className="h-28 bg-canvas-secondary rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      <h1 className="text-page-title">Dashboard</h1>

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
        <Card>
          <p className="text-label text-text-secondary mb-xs">Jumlah Zona</p>
          <p className="text-display text-text-primary">{usage.zonesCount}</p>
        </Card>
        <Card>
          <p className="text-label text-text-secondary mb-xs">Schedule Aktif</p>
          <p className="text-display text-text-primary">
            {usage.schedulesActiveCount}
            <span className="text-body text-text-muted"> / {usage.schedulesLimit}</span>
          </p>
        </Card>
      </div>

      <Card className="flex items-center justify-between">
        <div>
          <p className="text-section-title text-text-primary">Mulai pantau zona baru</p>
          <p className="text-body text-text-secondary mt-xs">
            Definisikan area, pilih kelas jalan, lalu capture kondisi lalu lintasnya.
          </p>
        </div>
        <Button onClick={() => setStepperOpen(true)}>Buat Zona Baru</Button>
      </Card>

      {usage.zonesCount > 0 && (
        <p className="text-caption text-text-secondary">
          Lihat semua zona di halaman <Link href="/zones" className="text-info no-underline hover:underline">Zona</Link>.
        </p>
      )}

      <ZoneCreateStepper
        open={stepperOpen}
        onClose={() => setStepperOpen(false)}
        onCreated={() => refetch()}
        existingZoneNames={zoneNames}
        plan={user.plan}
      />
    </div>
  )
}
