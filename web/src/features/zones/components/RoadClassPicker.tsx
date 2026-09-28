'use client'

import { useEffect, useMemo, useState } from 'react'
import { UpgradeModal } from '@/components/ui/UpgradeModal'
import { cn, formatNumber, formatKm } from '@/lib/utils'
import { PLAN_LIMITS, ROAD_CLASS_LABEL } from '@/lib/constants'
import * as zonesApi from '../api'
import type { RoadClass, ZoneGeometry } from '../types'
import type { Plan } from '@/features/auth/types'

export const ROAD_CLASS_ORDER: RoadClass[] = ['nasional', 'nasional_provinsi', 'semua']

const ROAD_CLASS_DESCRIPTION: Record<RoadClass, string> = {
  nasional: 'Motorways and inter-city trunk roads',
  nasional_provinsi: 'Adds provincial arterials',
  semua: 'Adds city and local streets',
}

/** What "none of this class" means in words, for the empty-zone notice (FE-01). */
const NONE_OF: Record<RoadClass, string> = {
  nasional: 'motorway or trunk road',
  nasional_provinsi: 'motorway, trunk or provincial road',
  semua: 'road with traffic data',
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

  // Real per-class counts for the boundary actually drawn. This used to be a fixed
  // catalogue that ignored the geometry, so the number meant to show what an upgrade
  // buys you was identical for every zone in the country.
  //
  // The result carries the bbox it answers for. That is what makes redrawing safe
  // without clearing state first: a result whose key no longer matches is simply not
  // this boundary's, and the row falls back to "counting" on its own.
  const bboxKey = useMemo(() => zonesApi.bboxOf(geometry).join(','), [geometry])
  const [result, setResult] = useState<{ key: string; counts: zonesApi.RoadClassCounts['counts'] | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    const bbox = bboxKey.split(',').map(Number) as [number, number, number, number]

    zonesApi
      .getRoadClassCounts(bbox)
      .then((res) => !cancelled && setResult({ key: bboxKey, counts: res.counts }))
      // HERE down, over quota, or the area too large. The counts are a convenience;
      // losing them must not stop someone choosing a class and saving the zone.
      .catch(() => !cancelled && setResult({ key: bboxKey, counts: null }))

    return () => {
      cancelled = true
    }
  }, [bboxKey])

  const current = result?.key === bboxKey ? result : null
  const counts = current?.counts ?? null
  const countsFailed = current !== null && current.counts === null

  // FE-01 — a correct zero still needs saying out loud. A small zone in a city centre can
  // honestly contain no motorway or trunk road, and a bare "0 roads" reads as a fault.
  // Say what it means (captures would be empty) and where the roads actually are.
  const selectedCount = value ? counts?.[value] : undefined
  const emptyNotice = (() => {
    if (!counts || !value || !selectedCount || selectedCount.roads > 0) return null
    const wider = ROAD_CLASS_ORDER.slice(ROAD_CLASS_ORDER.indexOf(value) + 1).find((c) => (counts[c]?.roads ?? 0) > 0)
    if (!wider) {
      return 'HERE has no traffic data for any road inside this boundary, so every capture would be empty. Try drawing a larger area, or one that crosses a main road.'
    }
    const widerLocked = ROAD_CLASS_ORDER.indexOf(wider) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)
    return `No ${NONE_OF[value]} runs through this area — normal for a small zone in a city centre — so captures would be empty. ${ROAD_CLASS_LABEL[wider]} covers ${formatNumber(counts[wider]!.roads)} roads here${widerLocked ? ` (${REQUIRED_PLAN_LABEL[wider]} plan)` : ''}, or draw a larger boundary that reaches a main road.`
  })()

  function pick(next: RoadClass) {
    if (ROAD_CLASS_ORDER.indexOf(next) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)) {
      setUpgradeFor(next)
      return
    }
    onChange(next)
  }


  return (
    <div className="space-y-sm">
      <p className="text-label text-text-secondary">
        Road class · {ROAD_CLASS_ORDER.indexOf(maxRoadClass) + 1} of 3 on your plan
      </p>

      {ROAD_CLASS_ORDER.map((option) => {
        const locked = ROAD_CLASS_ORDER.indexOf(option) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)
        const count = counts?.[option]
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
              {count
                ? count.roads === 0
                  ? 'No roads of this class in this area'
                  : `${formatNumber(count.roads)} roads · ${formatKm(count.lengthKm)}`
                : countsFailed
                  ? 'Road count unavailable'
                  : 'Counting roads…'}
            </span>
          </button>
        )
      })}

      {emptyNotice && (
        <p role="status" className="text-caption text-warning-text bg-warning-bg rounded-md px-md py-sm">
          {emptyNotice}
        </p>
      )}

      <UpgradeModal
        open={upgradeFor !== null}
        onClose={() => setUpgradeFor(null)}
        requiredPlan={upgradeFor ? REQUIRED_PLAN_LABEL[upgradeFor] : ''}
      />
    </div>
  )
}
