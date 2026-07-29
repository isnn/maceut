'use client'

import { RoadClassBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ManualCaptureButton } from '@/features/captures/components/ManualCaptureButton'
import type { Zone } from '../types'

export function ZoneCard({ zone, onDelete }: { zone: Zone; onDelete: (id: string) => void }) {
  return (
    <div className="bg-card border border-border rounded-lg p-xl flex items-center justify-between gap-lg">
      <div className="space-y-xs">
        <p className="text-heading-sm text-text-primary">{zone.name}</p>
        <RoadClassBadge roadClass={zone.roadClass} />
      </div>
      <div className="flex items-center gap-sm shrink-0">
        <ManualCaptureButton zoneId={zone.id} zoneName={zone.name} />
        <Button variant="destructive" className="h-10 px-lg" onClick={() => onDelete(zone.id)}>
          Hapus
        </Button>
      </div>
    </div>
  )
}
