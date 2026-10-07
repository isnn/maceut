'use client'

import { StatusPill } from '@/components/ui/Badge'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PlanPausedNotice } from '@/features/plan/PlanPausedNotice'
import Link from 'next/link'
import { Button, buttonClass } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Pagination, SortableTh, Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { useTableControls } from '@/components/ui/useTableControls'
import { cn } from '@/lib/utils'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { NextCollectionCard } from '@/features/schedules/components/NextCollectionCard'
import { WindowDialog, forgetWindowDraft, peekWindowDraft, type WindowDraft } from '@/features/schedules/components/WindowDialog'
import { PLAN_LIMITS } from '@/lib/constants'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as zonesApi from '@/features/zones/api'
import * as schedulesApi from '@/features/schedules/api'
import {
  DAY_LABEL,
  INTERVAL_LABEL,
  framesPerDay,
  type CaptureWindow,
} from '@/features/schedules/types'
import type { Zone } from '@/features/zones/types'

/** The board renders 05:00 → 21:00, matching the mockup's ruler. */
const FIRST_HOUR = 5
const LAST_HOUR = 21
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)

function hourOf(time: string): number {
  return Number(time.split(':')[0])
}

/**
 * Packs windows into rows so overlapping ones stop hiding each other.
 *
 * Every window was absolutely positioned on one 44px ruler, so two that share any hour
 * sat on top of each other — a zone with a morning and an all-day window showed one
 * bar and silently lost the other. Greedy first-fit: each window takes the first lane
 * whose last window has already ended, so a zone uses only as many rows as it actually
 * needs.
 *
 * Sorted by start time first, which is what makes first-fit produce the minimum number
 * of lanes rather than an arbitrary number.
 */
function packIntoLanes(windows: CaptureWindow[]): CaptureWindow[][] {
  const lanes: CaptureWindow[][] = []

  for (const w of [...windows].sort((a, b) => hourOf(a.start) - hourOf(b.start))) {
    const lane = lanes.find((l) => {
      const last = l[l.length - 1]!
      return hourOf(last.end) <= hourOf(w.start)
    })
    if (lane) lane.push(w)
    else lanes.push([w])
  }
  return lanes
}

export default function SchedulePage() {
  const { user } = useCurrentUser()
  const [zones, setZones] = useState<Zone[]>([])
  const [windows, setWindows] = useState<CaptureWindow[] | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<CaptureWindow | null>(null)
  /** Opened from the row menu's Delete: the dialog starts at the confirmation. */
  const [deleting, setDeleting] = useState(false)
  /** A dialog left for the plans page ("Upgrade"), restored on return (FE-30). */
  const [draft, setDraft] = useState<WindowDraft | null>(() => peekWindowDraft())

  const plan = user?.plan ?? 'free'
  const limits = PLAN_LIMITS[plan]

  const load = useCallback(async () => {
    const nextZones = await zonesApi.getZones()
    return { zones: nextZones, windows: await schedulesApi.getWindows() }
    // No dependency: both are scoped to the session server-side.
  }, [])

  const apply = useCallback((data: { zones: Zone[]; windows: CaptureWindow[] }) => {
    setZones(data.zones)
    setWindows(data.windows)
  }, [])

  const refetch = useCallback(() => load().then(apply), [load, apply])

  useEffect(() => {
    if (user) load().then(apply)
  }, [user, load, apply])

  // Reopen a dialog the user left to look at plans, with what they had typed.
  const draftWindow = draft?.id ? (windows?.find((w) => w.id === draft.id) ?? null) : null
  const shownEditing = editing ?? draftWindow
  const addShown = addOpen || (!!draft && !draft.id && windows !== null)

  const closeDialogs = () => {
    setAddOpen(false)
    setEditing(null)
    setDeleting(false)
    setDraft(null)
    forgetWindowDraft()
  }

  /** "Pause one" in the upgrade panel: close, and bring the windows list into view. */
  const pauseOne = () => {
    closeDialogs()
    document.getElementById('capture-windows')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function setActive(w: CaptureWindow, active: boolean) {
    await schedulesApi.updateWindow(w.id, { active })
    refetch()
  }

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? '—'

  const windowTable = useTableControls<CaptureWindow>({
    rows: windows,
    searchOn: (w) => [w.label, zoneName(w.zoneId)],
    sortOn: {
      label: (w) => w.label.toLowerCase(),
      zone: (w) => zoneName(w.zoneId).toLowerCase(),
      hours: (w) => w.start,
      frames: (w) => framesPerDay(w),
      // Active first when ascending: what is running belongs at the top.
      status: (w) => (w.active ? 0 : 1),
    },
    defaultDirection: { frames: 'desc' },
    pageSize: 10,
  })

  const framesTotal = useMemo(() => (windows ? schedulesApi.totalFramesPerDay(windows) : 0), [windows])
  const activeCount = windows?.filter((w) => w.active).length ?? 0

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <h1 className="text-page-title font-bold text-text-primary">Schedule</h1>
        <Button onClick={() => setAddOpen(true)} disabled={zones.length === 0}>
          Add window
        </Button>
      </div>

      <PlanPausedNotice
        zones={zones.filter((z) => z.status === 'paused' && z.pausedByPlan)}
        windows={(windows ?? []).filter((w) => !w.active && w.pausedByPlan)}
      />

      <div className="grid grid-cols-1 laptop:grid-cols-[1fr_320px] gap-xl items-start">
        <div className="bg-card border border-border rounded-lg p-lg space-y-lg">
          {windows === null ? (
            <div className="h-64 bg-canvas-secondary rounded-md animate-pulse" />
          ) : zones.length === 0 ? (
            <EmptyState
              title="No zones to schedule yet"
              description="Create a zone first, then set when it collects."
              action={
                <Link
                  href="/zones/new"
                  className={buttonClass()}
                >
                  Create zone
                </Link>
              }
            />
          ) : (
            <>
              {/* Hour ruler */}
              <div className="grid grid-cols-[160px_1fr] gap-md items-end">
                <span className="text-micro uppercase tracking-wide text-text-muted">Zone</span>
                <div>
                  {/* A schedule board can't be read without knowing which clock it's on. */}
                  <p className="text-micro text-text-muted text-right mb-xs">Asia/Jakarta · GMT+7</p>
                  <div className="flex">
                    {HOURS.map((hour) => (
                      <span key={hour} className="flex-1 text-micro text-text-muted tabular-nums text-center">
                        {hour % 2 === 1 ? String(hour).padStart(2, '0') : ''}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <ul className="space-y-md">
                {zones.map((zone) => {
                  const zoneWindows = windows.filter((w) => w.zoneId === zone.id)
                  return (
                    <li key={zone.id} className="grid grid-cols-[160px_1fr] gap-md items-start">
                      <div className="min-w-0">
                        <p className="text-label font-semibold text-text-primary truncate">{zone.name}</p>
                        <p className="text-micro text-text-muted mt-xs">
                          {zone.status === 'paused'
                            ? zone.pausedByPlan
                              ? 'Paused — over your plan’s limits'
                              : 'Paused — resume to collect'
                            : `${zoneWindows.length} windows · ${zoneWindows.reduce((s, w) => s + framesPerDay(w), 0)} frames/day`}
                        </p>
                      </div>
                      <div className="space-y-1">
                        {(zone.status === 'paused' ? [[]] : packIntoLanes(zoneWindows)).map((lane, laneIndex) => (
                          <div
                            key={laneIndex}
                            className="relative h-11 bg-canvas-secondary border border-divider rounded-md overflow-hidden"
                          >
                            {zone.status === 'paused' && (
                              <span className="absolute inset-0 flex items-center justify-center text-micro text-text-muted">
                                Paused
                              </span>
                            )}
                            {lane.map((w) => {
                              const start = ((hourOf(w.start) - FIRST_HOUR) / HOURS.length) * 100
                              const width = ((hourOf(w.end) - hourOf(w.start)) / HOURS.length) * 100
                              return (
                                <button
                                  key={w.id}
                                  onClick={() => setEditing(w)}
                                  title={`${w.label} · ${w.start}–${w.end}`}
                                  className={cn(
                                    'absolute top-1 bottom-1 rounded-sm px-sm text-micro font-semibold truncate text-left transition-colors',
                                    w.active
                                      ? 'bg-primary text-on-primary hover:bg-primary-hover'
                                      : 'bg-canvas border border-border text-text-muted'
                                  )}
                                  style={{ left: `${start}%`, width: `${Math.max(width, 6)}%` }}
                                >
                                  {w.start}–{w.end}
                                </button>
                              )
                            })}
                            {zone.status !== 'paused' && zoneWindows.length === 0 && (
                              <button
                                onClick={() => setAddOpen(true)}
                                className="absolute inset-0 flex items-center justify-center text-micro text-text-muted hover:text-primary transition-colors"
                              >
                                + Add a window
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <div className="space-y-lg">
          <Card className="p-lg space-y-md">
            <div>
              <p className="text-label text-text-secondary">Frames per day</p>
              <p className="text-display text-text-primary tabular-nums">
                {framesTotal}
                <span className="text-body text-text-muted"> / {limits.capturesLimit}</span>
              </p>
              <ProgressBar value={framesTotal} max={limits.capturesLimit} className="mt-sm" />
              {framesTotal > limits.capturesLimit && (
                <p className="text-caption text-warning-text mt-sm">
                  Over the plan&rsquo;s daily limit — captures beyond it are skipped (BR-006).
                </p>
              )}
            </div>
            <div className="border-t border-divider pt-md">
              <p className="text-label text-text-secondary">Active windows</p>
              <p className="text-body font-semibold text-text-primary tabular-nums">
                {activeCount} / {limits.schedulesLimit}
              </p>
            </div>
            <div className="border-t border-divider pt-md">
              <p className="text-label text-text-secondary">Retention</p>
              <p className="text-body font-semibold text-text-primary">{limits.historyLabel}</p>
            </div>
          </Card>

          <NextCollectionCard windows={windows ?? []} zones={zones} />
        </div>
      </div>

      {/* Every window as a list, under the ruler. The ruler answers "when does this zone
          collect?" at a glance; this answers "what exactly is set up, and is any of it
          paused?" — which a bar chart cannot, and which is the question when something
          has stopped collecting. */}
      <section id="capture-windows" className="space-y-md scroll-mt-xl">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <h2 className="text-section-title text-text-primary">Capture windows</h2>
          <Input
            type="search"
            placeholder="Search windows or zones…"
            value={windowTable.search}
            onChange={(e) => windowTable.setSearch(e.target.value)}
            className="w-full tablet:w-64"
          />
        </div>
      
        {(windows ?? []).length === 0 ? (
          <EmptyState title="No capture windows yet" description="A zone stays idle until one is set." />
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
                      active={windowTable.sort?.key === 'zone'}
                      direction={windowTable.sort?.direction ?? 'asc'}
                      onSort={() => windowTable.toggleSort('zone')}
                    >
                      Zone
                    </SortableTh>
                    <SortableTh
                      active={windowTable.sort?.key === 'hours'}
                      direction={windowTable.sort?.direction ?? 'asc'}
                      onSort={() => windowTable.toggleSort('hours')}
                    >
                      Hours
                    </SortableTh>
                    <Th>Interval</Th>
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
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {windowTable.visible.map((w) => (
                    <tr key={w.id} className="hover:bg-canvas-secondary/60 transition-colors">
                      <Td className="font-semibold text-text-primary">{w.label}</Td>
                      <Td className="text-text-secondary">{zoneName(w.zoneId)}</Td>
                      <Td className="tabular-nums text-text-secondary whitespace-nowrap">
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
                        <StatusPill
                          tone={w.active ? 'success' : w.pausedByPlan ? 'warning' : 'neutral'}
                          title={!w.active && w.pausedByPlan ? 'Paused because it is over your plan’s limits' : undefined}
                        >
                          {w.active ? 'Active' : w.pausedByPlan ? 'Paused · plan limit' : 'Paused'}
                        </StatusPill>
                      </Td>
                      <Td className="text-right">
                        <ActionMenu
                          label={`Actions for ${w.label}`}
                          items={[
                            { label: 'Edit', onSelect: () => setEditing(w) },
                            w.active
                              ? { label: 'Pause', onSelect: () => void setActive(w, false) }
                              : { label: 'Resume', onSelect: () => void setActive(w, true) },
                            {
                              label: 'Delete',
                              destructive: true,
                              onSelect: () => {
                                setDeleting(true)
                                setEditing(w)
                              },
                            },
                          ]}
                        />
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
      </section>

      {addShown && (
        <WindowDialog
          open
          zones={zones}
          windows={windows ?? []}
          plan={plan}
          initialDraft={draft && !draft.id ? draft : null}
          onClose={closeDialogs}
          onSaved={() => {
            closeDialogs()
            refetch()
          }}
          onPauseOne={pauseOne}
        />
      )}

      {shownEditing && (
        <WindowDialog
          open
          zones={zones}
          windows={windows ?? []}
          plan={plan}
          editing={shownEditing}
          initialDraft={draft?.id === shownEditing.id ? draft : null}
          startWithDelete={deleting}
          onClose={closeDialogs}
          onSaved={() => {
            closeDialogs()
            refetch()
          }}
          onPauseOne={pauseOne}
        />
      )}
    </div>
  )
}
