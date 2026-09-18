'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, buttonClass } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { RoadClassBadge, ZoneStatusPill } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { IconArrowLeft } from '@/components/ui/icons'
import { cn, formatDate } from '@/lib/utils'
import { PLAN_LIMITS, ROAD_CLASS_LABEL } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { MapCanvas } from './MapCanvas'
import { RoadClassPicker, ROAD_CLASS_ORDER } from './RoadClassPicker'
import * as zonesApi from '../api'
import type { RoadClass, Zone } from '../types'
import type { Plan } from '@/features/auth/types'

export function ZoneDetail({ zoneId, plan }: { zoneId: string; plan: Plan }) {
  const router = useRouter()
  const [zone, setZone] = useState<Zone | null>(null)
  const [siblings, setSiblings] = useState<Zone[]>([])
  const [notFound, setNotFound] = useState(false)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [roadClass, setRoadClass] = useState<RoadClass>('nasional')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const [found, all] = await Promise.all([
      zonesApi.getZone(zoneId).catch(() => null),
      zonesApi.getZones(plan),
    ])
    return { found, siblings: all.filter((z) => z.id !== zoneId) }
  }, [zoneId, plan])

  const apply = useCallback((data: { found: Zone | null; siblings: Zone[] }) => {
    if (!data.found) {
      setNotFound(true)
      return
    }
    setZone(data.found)
    setSiblings(data.siblings)
    setName(data.found.name)
    setRoadClass(data.found.roadClass)
  }, [])

  useEffect(() => {
    load().then(apply)
  }, [load, apply])

  if (notFound) {
    return (
      <EmptyState
        title="Zone not found"
        description="It may have been deleted, or the link is wrong."
        action={
          <Link href="/zones" className={buttonClass()}>
            Back to zones
          </Link>
        }
      />
    )
  }

  if (!zone) return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />

  // BR-015 feedback while typing; the API enforces it on save.
  const nameTaken =
    name.trim() !== '' && siblings.some((z) => z.name.toLowerCase() === name.trim().toLowerCase())
  const canSave = name.trim() !== '' && !nameTaken && !saving

  // BR-022 — the zone keeps the class it was created with, but captures are
  // capped at whatever the current plan allows. That's invisible unless said.
  const maxRoadClass = PLAN_LIMITS[plan].maxRoadClass
  const cappedByPlan = ROAD_CLASS_ORDER.indexOf(zone.roadClass) > ROAD_CLASS_ORDER.indexOf(maxRoadClass)

  function startEdit() {
    setName(zone!.name)
    setRoadClass(zone!.roadClass)
    setError(null)
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await zonesApi.updateZone(zone!.id, { name: name.trim(), roadClass }, plan)
      setZone(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus() {
    const updated = await zonesApi.setZoneStatus(zone!.id, zone!.status === 'collecting' ? 'paused' : 'collecting')
    setZone(updated)
  }

  async function remove() {
    setDeleting(true)
    await zonesApi.deleteZone(zone!.id)
    router.push('/zones')
  }

  return (
    <div className="space-y-lg">
      <Link href="/zones" className="inline-flex items-center gap-sm text-body text-text-secondary no-underline hover:text-text-primary transition-colors">
        <IconArrowLeft size={16} />
        All zones
      </Link>

      <div className="flex flex-wrap items-center gap-md">
        <h1 className="text-page-title font-bold text-text-primary">{zone.name}</h1>
        <ZoneStatusPill status={zone.status} />
        <div className="ml-auto flex flex-wrap items-center gap-sm">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!canSave}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={startEdit}>
                Edit
              </Button>
              <Button variant="secondary" onClick={toggleStatus}>
                {zone.status === 'collecting' ? 'Pause' : 'Resume'}
              </Button>
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <Alert variant="warning">{error}</Alert>}

      <div className="grid grid-cols-1 laptop:grid-cols-[1fr_340px] gap-xl items-start">
        <div className="bg-card border border-border rounded-lg p-lg space-y-md">
          <p className="text-label text-text-secondary">Boundary</p>
          <MapCanvas polygon={zone.geometry} className="h-96 w-full" />
          <p className="text-caption text-text-secondary">
            The boundary is set when the zone is created and can&rsquo;t be redrawn here.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-lg space-y-lg">
          {editing ? (
            <>
              <div className="space-y-xs">
                <FormLabel htmlFor="zone-name">Zone name</FormLabel>
                <Input
                  id="zone-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full"
                />
                {nameTaken && <p className="text-caption text-danger-text">That zone name is already taken.</p>}
              </div>

              <div className="border-t border-divider pt-lg space-y-sm">
                <RoadClassPicker value={roadClass} onChange={setRoadClass} geometry={zone.geometry} plan={plan} />
                <p className="text-caption text-text-secondary pt-sm">
                  Changing the class re-derives which roads are collected from the next capture on. Frames already
                  captured keep the class they were taken with.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-heading-sm text-text-primary">Zone details</p>
              </div>

              <dl className="space-y-md">
                <Row label="Road class">
                  <span className="flex flex-wrap items-center justify-end gap-xs">
                    <RoadClassBadge roadClass={zone.roadClass} />
                    {cappedByPlan && (
                      <span className="text-micro text-text-muted">
                        capped to {ROAD_CLASS_LABEL[maxRoadClass]} on your plan
                      </span>
                    )}
                  </span>
                </Row>
                <Row label="Area">{zone.areaKm2} km²</Row>
                <Row label="Roads collected">{zone.roadsCount}</Row>
                <Row label="Total length">{zone.lengthKm} km</Row>
                <Row label="Capture cadence">{zone.cadence}</Row>
                <Row label="Created">{formatDate(zone.createdAt)}</Row>
              </dl>

              <p className="text-caption text-text-secondary border-t border-divider pt-lg">
                Capture times are set on the <Link href="/schedule" className="text-info no-underline hover:underline">Schedule</Link> page.
              </p>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${zone.name}”?`}
        description="Captures and animations for this zone are kept for 30 days, then removed. Its capture windows stop too."
        confirmLabel="Delete zone"
        destructive
        pending={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-start justify-between gap-md')}>
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="text-body font-semibold text-text-primary tabular-nums text-right">{children}</dd>
    </div>
  )
}
