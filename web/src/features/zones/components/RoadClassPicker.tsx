'use client'

import { useMemo, useState } from 'react'
import { UpgradeModal } from '@/components/ui/UpgradeModal'
import { cn } from '@/lib/utils'
import { PLAN_LIMITS, ROAD_CLASS_LABEL } from '@/lib/constants'
import * as zonesApi from '../api'
import type { MatchedRoad, RoadClass, ZoneGeometry } from '../types'
import type { Plan } from '@/features/auth/types'

export const ROAD_CLASS_ORDER: RoadClass[] = ['nasional', 'nasional_provinsi', 'semua']

const ROAD_CLASS_DESCRIPTION: Record<RoadClass, string> = {
  nasional: 'Motorways and inter-city trunk roads',
  nasional_provinsi: 'Adds provincial arterials',
  semua: 'Adds city and local streets',
}

export const REQUIRED_PLAN_LABEL: Record<RoadClass, string> = {
  nasional: 'Free',
  nasional_provinsi: 'Standard',
  semua: 'Premium',
}

interface RoadClassPickerProps {
  value: RoadClass | null
  onChange: (next: RoadClass) => void
  /** Drives the per-class road counts. */
  geometry: ZoneGeometry
  plan: Plan
}

/**
 * Shared by the create wizard and the zone edit form. Both have to lock the
 * same classes behind the same plans (BR-021), so they render the same control
 * rather than two copies that drift the next time a rule changes.
 */
export function RoadClassPicker({ value, onChange, geometry, plan }: RoadClassPickerProps) {
  const [upgradeFor, setUpgradeFor] = useState<RoadClass | null>(null)
  const maxRoadClass = PLAN_LIMITS[plan].maxRoadClass

  const perClass = useMemo(() => {
    const all = zonesApi.matchRoads(geometry, 'semua')
    return {
      nasional: all.filter((r) => r.roadClass === 'nasional'),
      provinsi: all.filter((r) => r.roadClass === 'provinsi'),
      kota: all.filter((r) => r.roadClass === 'kota'),
    }
  }, [geometry])

  function pick(next: RoadClass) {
    if (ROAD_CLASS_ORDER.indexOf(next) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)) {
      setUpgradeFor(next)
      return
    }
    onChange(next)
  }

  function roadsFor(option: RoadClass): MatchedRoad[] {
    if (option === 'nasional') return perClass.nasional
    if (option === 'nasional_provinsi') return [...perClass.nasional, ...perClass.provinsi]
    return [...perClass.nasional, ...perClass.provinsi, ...perClass.kota]
  }

  return (
    <div className="space-y-sm">
      <p className="text-label text-text-secondary">
        Road class · {ROAD_CLASS_ORDER.indexOf(maxRoadClass) + 1} of 3 on your plan
      </p>

      {ROAD_CLASS_ORDER.map((option) => {
        const locked = ROAD_CLASS_ORDER.indexOf(option) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)
        const roads = roadsFor(option)
        const km = Number(roads.reduce((sum, r) => sum + r.lengthKm, 0).toFixed(1))
        return (
          <button
            key={option}
            type="button"
            onClick={() => pick(option)}
            className={cn(
              'w-full text-left border rounded-md p-md transition-colors',
              value === option ? 'border-primary bg-primary-soft/40' : 'border-border hover:bg-canvas-secondary',
              locked && 'opacity-70'
            )}
          >
            <span className="flex items-center justify-between gap-sm">
              <span className="text-label font-semibold text-text-primary">{ROAD_CLASS_LABEL[option]}</span>
              {locked && (
                <span className="text-micro font-semibold bg-warning-bg text-warning-text rounded-xs px-sm py-xs">
                  {REQUIRED_PLAN_LABEL[option]}
                </span>
              )}
            </span>
            <span className="block text-micro text-text-muted mt-xs">{ROAD_CLASS_DESCRIPTION[option]}</span>
            <span className="block text-micro text-text-secondary mt-xs tabular-nums">
              {roads.length} roads · {km} km
            </span>
          </button>
        )
      })}

      <UpgradeModal
        open={upgradeFor !== null}
        onClose={() => setUpgradeFor(null)}
        requiredPlan={upgradeFor ? REQUIRED_PLAN_LABEL[upgradeFor] : ''}
      />
    </div>
  )
}
