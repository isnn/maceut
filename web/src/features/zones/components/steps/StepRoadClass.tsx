'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { UpgradeModal } from '@/components/ui/UpgradeModal'
import { PLAN_LIMITS, ROAD_CLASS_LABEL, ROAD_CLASS_REQUIRED_PLAN } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { TrafficPreviewPanel } from '../TrafficPreviewPanel'
import type { Plan } from '@/features/auth/types'
import type { RoadClass, ZoneGeometry } from '../../types'

const ROAD_CLASS_ORDER: RoadClass[] = ['nasional', 'nasional_provinsi', 'semua']
const ROAD_CLASS_DESCRIPTIONS: Record<RoadClass, string> = {
  nasional: 'Jalan tol, arteri utama (motorway, trunk, primary).',
  nasional_provinsi: 'Nasional + jalan penghubung provinsi (secondary).',
  semua: 'Semua kelas jalan termasuk jalan kota & lokal (tertiary, residential).',
}

interface StepRoadClassProps {
  roadClass: RoadClass | null
  onRoadClassChange: (rc: RoadClass) => void
  plan: Plan
  geometry: ZoneGeometry
  zoneName: string
  onNext: () => void
  onBack: () => void
}

export function StepRoadClass({ roadClass, onRoadClassChange, plan, geometry, zoneName, onNext, onBack }: StepRoadClassProps) {
  const [upgradeFor, setUpgradeFor] = useState<RoadClass | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const maxAllowed = PLAN_LIMITS[plan].maxRoadClass

  function handleSelect(option: RoadClass) {
    if (ROAD_CLASS_ORDER.indexOf(option) > ROAD_CLASS_ORDER.indexOf(maxAllowed)) {
      setUpgradeFor(option)
      return
    }
    onRoadClassChange(option)
  }

  return (
    <div className="space-y-lg">
      <div className="space-y-sm">
        {ROAD_CLASS_ORDER.map((option) => {
          const active = roadClass === option
          const locked = ROAD_CLASS_ORDER.indexOf(option) > ROAD_CLASS_ORDER.indexOf(maxAllowed)
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={cn(
                'w-full text-left rounded-md border p-lg transition-colors',
                active ? 'border-primary ring-2 ring-primary-soft' : 'border-border hover:bg-canvas-secondary'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-heading-sm text-text-primary">{ROAD_CLASS_LABEL[option]}</span>
                {locked && <span className="text-micro text-text-muted">Perlu upgrade</span>}
              </div>
              <p className="text-caption text-text-secondary mt-xs">{ROAD_CLASS_DESCRIPTIONS[option]}</p>
            </button>
          )
        })}
      </div>

      <Button type="button" variant="secondary" onClick={() => setPreviewOpen(true)} disabled={!roadClass}>
        Preview
      </Button>

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={onBack}>
          Kembali
        </Button>
        <Button type="button" onClick={onNext} disabled={!roadClass}>
          Lanjut
        </Button>
      </div>

      {upgradeFor && (
        <UpgradeModal open onClose={() => setUpgradeFor(null)} requiredPlan={ROAD_CLASS_REQUIRED_PLAN[upgradeFor]} />
      )}

      {roadClass && (
        <TrafficPreviewPanel
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          geometry={geometry}
          roadClass={roadClass}
          defaultTitle={zoneName}
        />
      )}
    </div>
  )
}
