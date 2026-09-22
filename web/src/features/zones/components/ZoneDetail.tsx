'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonClass } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { RoadClassBadge, ZoneStatusPill } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Pagination, SortableTh, Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { useTableControls } from '@/components/ui/useTableControls'
import { IconArrowLeft } from '@/components/ui/icons'
import { cn, formatDate } from '@/lib/utils'
import { PLAN_LIMITS, ROAD_CLASS_LABEL } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { MapCanvas } from './MapCanvas'
import { RoadClassPicker, ROAD_CLASS_ORDER } from './RoadClassPicker'
import { ZoneSnapshots } from './ZoneSnapshots'
import * as zonesApi from '../api'
import * as schedulesApi from '@/features/schedules/api'
import { DAY_LABEL, INTERVAL_LABEL, framesPerDay, type CaptureWindow } from '@/features/schedules/types'
import type { RoadClass, Zone } from '../types'
import type { Plan } from '@/features/auth/types'

export function ZoneDetail({ zoneId, plan }: { zoneId: string; plan: Plan }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [zone, setZone] = useState<Zone | null>(null)
  const [siblings, setSiblings] = useState<Zone[]>([])
  const [windows, setWindows] = useState<CaptureWindow[]>([])

  // A zone can hold up to 50 windows on Premium, well past what anyone can scan in
  // one list — so this gets the same search, sort and paging as every other table.
  const windowTable = useTableControls<CaptureWindow>({
    rows: windows,
    searchOn: (w) => [w.label],
    sortOn: {
      label: (w) => w.label.toLowerCase(),
      hours: (w) => w.start,
      interval: (w) => w.interval,
      frames: (w) => framesPerDay(w),
      // Active first when ascending: what is running belongs at the top, not
      // wherever 'active' happens to fall alphabetically against 'paused'.
      status: (w) => (w.active ? 0 : 1),
    },
    defaultDirection: { frames: 'desc' },
    pageSize: 8,
  })
  const [notFound, setNotFound] = useState(false)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [roadClass, setRoadClass] = useState<RoadClass>('nasional')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const [found, all, allWindows] = await Promise.all([
      zonesApi.getZone(zoneId).catch(() => null),
      zonesApi.getZones(),
      schedulesApi.getWindows(),
    ])
    return {
      found,
      siblings: all.filter((z) => z.id !== zoneId),
      windows: allWindows.filter((w) => w.zoneId === zoneId),
    }
  }, [zoneId])

  const apply = useCallback(
    (data: { found: Zone | null; siblings: Zone[]; windows: CaptureWindow[] }) => {
      if (!data.found) {
        setNotFound(true)
        return
      }
      setZone(data.found)
      setSiblings(data.siblings)
      setWindows(data.windows)
      setName(data.found.name)
      setRoadClass(data.found.roadClass)
      // The list's Edit action deep-links straight into edit mode.
      if (searchParams.get('edit') === '1') setEditing(true)
    },
    [searchParams]
  )

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
      const updated = await zonesApi.updateZone(zone!.id, { name: name.trim(), roadClass })
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
                <Row label="Roads collected">{zone.roadsCount ?? '—'}</Row>
                <Row label="Total length">{zone.lengthKm === null ? '—' : `${zone.lengthKm} km`}</Row>
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

      <ZoneSnapshots zone={zone} />

      {/* The windows that actually make this zone collect — without them a zone
          sits idle, which is invisible from its attributes alone. */}
      <section className="space-y-md">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <h2 className="text-section-title text-text-primary">Capture windows</h2>
          <div className="flex items-center gap-md ml-auto">
            {/* Only worth showing once there is enough to look through. */}
            {windows.length > 3 && (
              <Input
                type="search"
                placeholder="Search windows…"
                value={windowTable.search}
                onChange={(e) => windowTable.setSearch(e.target.value)}
                className="w-full tablet:w-56"
              />
            )}
            <Link
              href="/schedule"
              className="text-body text-info no-underline hover:underline whitespace-nowrap"
            >
              Manage on Schedule
            </Link>
          </div>
        </div>

        {windows.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-lg">
            <p className="text-body text-text-secondary">
              No capture windows yet — this zone stays idle until one is set.
            </p>
            <Link href="/schedule" className={cn(buttonClass('secondary'), 'mt-md')}>
              Set a window
            </Link>
          </div>
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <SortableTh
                      active={windowTable.sort?.key === 'label'}
                      direction={windowTable.sort?.direction ?? 'asc'}
                      onSort={() => windowTable.toggleSort('label')}
                    >
                      Window
                    </SortableTh>
                    <SortableTh
                      active={windowTable.sort?.key === 'hours'}
                      direction={windowTable.sort?.direction ?? 'asc'}
                      onSort={() => windowTable.toggleSort('hours')}
                    >
                      Hours
                    </SortableTh>
                    <SortableTh
                      active={windowTable.sort?.key === 'interval'}
                      direction={windowTable.sort?.direction ?? 'asc'}
                      onSort={() => windowTable.toggleSort('interval')}
                    >
                      Interval
                    </SortableTh>
                    <Th>Days</Th>
                    <SortableTh
                      className="text-right"
                      active={windowTable.sort?.key === 'frames'}
                      direction={windowTable.sort?.direction ?? 'asc'}
                      onSort={() => windowTable.toggleSort('frames')}
                    >
                      Frames / day
                    </SortableTh>
                    <SortableTh
                      active={windowTable.sort?.key === 'status'}
                      direction={windowTable.sort?.direction ?? 'asc'}
                      onSort={() => windowTable.toggleSort('status')}
                    >
                      Status
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                    {windowTable.visible.map((w) => (
                    <tr key={w.id} className="hover:bg-canvas-secondary/60 transition-colors">
                      <Td>
                        <p className="font-semibold text-text-primary">{w.label}</p>
                        <p className="text-caption text-text-muted mt-xs tabular-nums">
                          {w.capturedFrames} frames captured
                        </p>
                      </Td>
                      <Td className="tabular-nums text-text-secondary">
                        {w.start}–{w.end}
                      </Td>
                      <Td className="text-text-secondary">{INTERVAL_LABEL[w.interval]}</Td>
                      <Td>
                        <span className="flex gap-xs">
                          {DAY_LABEL.map((label, index) => (
                            <span
                              key={`${w.id}-${index}`}
                              title={w.days.includes(index) ? 'Collecting' : 'Not collecting'}
                              className={cn(
                                'w-5 h-5 rounded-xs text-micro flex items-center justify-center',
                                w.days.includes(index)
                                  ? 'bg-primary-soft text-[#5A35F3] font-semibold'
                                  : 'bg-canvas-secondary text-text-muted'
                              )}
                            >
                              {label}
                            </span>
                          ))}
                        </span>
                      </Td>
                      <Td className="text-right tabular-nums">{framesPerDay(w)}</Td>
                      <Td>
                        <span
                          className={cn(
                            'text-micro font-semibold rounded-xs px-sm py-xs whitespace-nowrap',
                            w.active
                              ? 'bg-success-bg text-success-text'
                              : 'bg-canvas-secondary text-text-muted border border-border'
                          )}
                        >
                          {w.active ? 'Active' : 'Paused'}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination
              page={windowTable.page}
              pageCount={windowTable.pageCount}
              pageSize={windowTable.pageSize}
              onPage={windowTable.setPage}
              matchCount={windowTable.matchCount}
              totalCount={windowTable.totalCount}
              noun="windows"
              onClearSearch={windowTable.search ? () => windowTable.setSearch('') : undefined}
            />
          </>
        )}

        {zone.status === 'paused' && windows.length > 0 && (
          <Alert variant="warning">
            This zone is paused, so none of its windows are collecting — resume it to start again.
          </Alert>
        )}
      </section>

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
