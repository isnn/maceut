'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { ZoneCard } from '@/features/zones/components/ZoneCard'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as zonesApi from '@/features/zones/api'
import type { Zone } from '@/features/zones/types'

const ZoneCreateStepper = dynamic(
  () => import('@/features/zones/components/ZoneCreateStepper').then((m) => m.ZoneCreateStepper),
  { ssr: false }
)

export default function ZonesPage() {
  const { user } = useCurrentUser()
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [stepperOpen, setStepperOpen] = useState(false)

  const refetch = useCallback(() => {
    zonesApi.getZones().then(setZones)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function handleDelete(id: string) {
    await zonesApi.deleteZone(id)
    refetch()
  }

  if (!zones || !user) {
    return (
      <div className="space-y-md">
        <div className="h-8 w-48 bg-canvas-secondary rounded-md animate-pulse" />
        <div className="h-24 bg-canvas-secondary rounded-lg animate-pulse" />
        <div className="h-24 bg-canvas-secondary rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title">Zona</h1>
        <Button onClick={() => setStepperOpen(true)}>Buat Zona Baru</Button>
      </div>

      {zones.length === 0 ? (
        <EmptyState
          title="Belum ada zona"
          description="Buat zona pertama Anda untuk mulai memantau kondisi lalu lintas."
          action={<Button onClick={() => setStepperOpen(true)}>Buat Zona Pertama</Button>}
        />
      ) : (
        <div className="space-y-md">
          {zones.map((zone) => (
            <ZoneCard key={zone.id} zone={zone} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <ZoneCreateStepper
        open={stepperOpen}
        onClose={() => setStepperOpen(false)}
        onCreated={() => refetch()}
        existingZoneNames={zones.map((z) => z.name)}
        plan={user.plan}
      />
    </div>
  )
}
