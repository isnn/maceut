'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonClass } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { RoadClassBadge, StatusPill, ZoneStatusPill } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { CardTitle, SectionHeader } from '@/components/shared/SectionHeader'
import { showToast } from '@/components/ui/Toaster'
import { HelpTip } from '@/components/ui/HelpTip'
import { Pagination, SortableTh, Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { useTableControls } from '@/components/ui/useTableControls'
import {
  IconArrowLeft,
  IconCalendar,
  IconCamera,
  IconClipboardList,
  IconClock,
  IconFilm,
  IconMap,
  IconPause,
  IconPencil,
  IconPlay,
  IconTrash,
} from '@/components/ui/icons'
import { cn, formatDate, formatNumber } from '@/lib/utils'
import { PLAN_LIMITS, ROAD_CLASS_LABEL } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { MapCanvas } from './MapCanvas'
import { RoadClassPicker, ROAD_CLASS_ORDER } from './RoadClassPicker'
import { ZoneCaptures } from './ZoneCaptures'
import { ZoneExports } from '@/features/exports/components/ZoneExports'
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

  // "Capture now" lives in the page header; the Captures section reloads when this bumps.
  const [capturing, setCapturing] = useState(false)
  const [capturesKey, setCapturesKey] = useState(0)

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

  async function captureNow() {
    setCapturing(true)
    try {
      const res = await zonesApi.runCapture(zone!.id)
      if (res.queued) {
        showToast({ tone: 'success', title: 'Collecting now', description: 'The new capture appears below in a few seconds.' })
        setCapturesKey((k) => k + 1)
        // The worker needs a moment; reload once more rather than polling.
        setTimeout(() => setCapturesKey((k) => k + 1), 4000)
      } else {
        showToast({ tone: 'warning', title: 'Capture not started', description: res.capture.error ?? 'Your daily capture limit is used up.' })
        setCapturesKey((k) => k + 1)
      }
    } catch (err) {
      showToast({
        tone: 'warning',
        title: 'Capture not started',
        description: err instanceof ApiError ? err.message : 'Could not start a capture. Please try again.',
      })
    } finally {
      setCapturing(false)
    }
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
        <ZoneStatusPill status={zone.status} pausedByPlan={zone.pausedByPlan} />
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
              <Button onClick={captureNow} disabled={capturing}>
                <IconCamera size={18} />
                {capturing ? 'Starting…' : 'Capture now'}
              </Button>
              <Link href={`/studio?zone=${zone.id}`} className={buttonClass('ink')}>
                <IconFilm size={18} />
                Open in Studio
              </Link>
              <Button variant="tint" onClick={startEdit}>
                <IconPencil size={16} />
                Edit
              </Button>
              <Button variant="tint" onClick={toggleStatus}>
                {zone.status === 'collecting' ? <IconPause size={16} /> : <IconPlay size={16} />}
                {zone.status === 'collecting' ? 'Pause' : 'Resume'}
              </Button>
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <IconTrash size={16} />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <Alert variant="warning">{error}</Alert>}

      <div className="grid grid-cols-1 laptop:grid-cols-[1fr_340px] gap-xl items-start">
        <div className="bg-card border border-border rounded-lg p-lg space-y-md">
          <CardTitle
            icon={<IconMap size={16} />}
            aside={
              <HelpTip label="About the boundary">
                The boundary is set when the zone is created and can&rsquo;t be redrawn here. To cover a different
                area, create a new zone.
              </HelpTip>
            }
          >
            Boundary
          </CardTitle>
          <MapCanvas polygon={zone.geometry} className="h-96 w-full" />
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
              <CardTitle icon={<IconClipboardList size={16} />}>Zone details</CardTitle>

              {/* What it collects: the class, and what that class adds up to here. */}
              <div className="space-y-sm">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <span className="text-caption text-text-muted">Road class</span>
                  <RoadClassBadge roadClass={zone.roadClass} />
                </div>
                {cappedByPlan && (
                  <p className="text-micro text-warning-text text-right">
                    Captures use {ROAD_CLASS_LABEL[maxRoadClass]} on your plan
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-3 gap-sm">
                <Metric label="Area" value={formatNumber(zone.areaKm2, zone.areaKm2 < 10 ? 2 : 0)} unit="km²" />
                <Metric label="Roads" value={zone.roadsCount === null ? '—' : formatNumber(zone.roadsCount)} />
                <Metric label="Length" value={zone.lengthKm === null ? '—' : formatNumber(zone.lengthKm, zone.lengthKm < 100 ? 1 : 0)} unit={zone.lengthKm === null ? undefined : 'km'} />
              </dl>

              <dl className="divide-y divide-divider border-t border-divider">
                <div className="flex items-start justify-between gap-md py-md">
                  <dt className="flex items-center gap-sm text-caption text-text-muted shrink-0">
                    <IconClock size={14} />
                    Capture cadence
                  </dt>
                  <dd className="text-label font-semibold text-text-primary text-right">
                    {zone.cadence ?? (
                      <Link href="/schedule" className="text-info no-underline hover:underline font-medium">
                        Not scheduled — set a window
                      </Link>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-md pt-md">
                  <dt className="flex items-center gap-sm text-caption text-text-muted">
                    <IconCalendar size={14} />
                    Created
                  </dt>
                  <dd className="text-label font-semibold text-text-primary tabular-nums">{formatDate(zone.createdAt)}</dd>
                </div>
              </dl>

            </>
          )}
        </div>
      </div>

      {/* The windows that actually make this zone collect — without them a zone
          sits idle, which is invisible from its attributes alone. */}
      <section className="space-y-md">
        <SectionHeader
          icon={<IconClock size={18} />}
          title="Capture windows"
          actions={
            <>
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
              <Link href="/schedule" className={buttonClass('tint')}>
                <IconCalendar size={16} />
                Manage on Schedule
              </Link>
            </>
          }
        />

        {windows.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-lg">
            <p className="text-body text-text-secondary">
              No capture windows yet — this zone stays idle until one is set.
            </p>
            <Link href="/schedule" className={cn(buttonClass('tint'), 'mt-md')}>
              <IconCalendar size={16} />
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
                      Hours (WIB)
                    </SortableTh>
                    <Th>Days</Th>
                    <SortableTh
                      active={windowTable.sort?.key === 'interval'}
                      direction={windowTable.sort?.direction ?? 'asc'}
                      onSort={() => windowTable.toggleSort('interval')}
                    >
                      Interval
                    </SortableTh>
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
                      <Td>
                        <span className="flex gap-xs">
                          {DAY_LABEL.map((label, index) => (
                            <span
                              key={`${w.id}-${index}`}
                              title={w.days.includes(index) ? 'Collecting' : 'Not collecting'}
                              className={cn(
                                'w-5 h-5 rounded-xs text-micro flex items-center justify-center',
                                w.days.includes(index)
                                  ? 'bg-primary-soft text-primary font-semibold'
                                  : 'bg-canvas-secondary text-text-muted'
                              )}
                            >
                              {label}
                            </span>
                          ))}
                        </span>
                      </Td>
                      <Td className="text-text-secondary">{INTERVAL_LABEL[w.interval]}</Td>
                      <Td className="text-right tabular-nums">{framesPerDay(w)}</Td>
                      <Td>
                        <StatusPill
                          tone={w.active ? 'success' : w.pausedByPlan ? 'warning' : 'neutral'}
                          title={!w.active && w.pausedByPlan ? 'Paused because it is over your plan’s limits' : undefined}
                        >
                          {w.active ? 'Active' : w.pausedByPlan ? 'Paused · plan limit' : 'Paused'}
                        </StatusPill>
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

      <ZoneCaptures zone={zone} refreshKey={capturesKey} />

      {/* Last on the page: exports are made in Studio and collected here. */}
      <ZoneExports zoneId={zone.id} />

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

/** One headline number of the zone: big value, small unit, a label under it. */
function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    // Label first in the markup (a <dl> wants dt before dd), shown under the number.
    <div className="rounded-md bg-primary-soft/50 px-sm py-md text-center min-w-0 flex flex-col-reverse">
      <dt className="text-micro text-text-muted mt-[2px]">{label}</dt>
      <dd className="text-heading-sm font-bold text-text-primary tabular-nums truncate">
        {value}
        {unit && <span className="text-caption font-medium text-text-secondary ml-[2px]">{unit}</span>}
      </dd>
    </div>
  )
}
