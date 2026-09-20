'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import { Button, buttonClass } from '@/components/ui/Button'
import { Checkbox, FormLabel, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import { PLAN_LABEL, PLAN_LIMITS } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as zonesApi from '@/features/zones/api'
import * as schedulesApi from '@/features/schedules/api'
import {
  DAY_LABEL,
  DAY_NAME,
  INTERVAL_LABEL,
  framesPerDay,
  type CaptureInterval,
  type CaptureWindow,
} from '@/features/schedules/types'
import type { Zone } from '@/features/zones/types'
import { can } from '@/features/auth/capabilities'

/** The board renders 05:00 → 21:00, matching the mockup's ruler. */
const FIRST_HOUR = 5
const LAST_HOUR = 21
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)

function hourOf(time: string): number {
  return Number(time.split(':')[0])
}

export default function SchedulePage() {
  const { user } = useCurrentUser()
  const [zones, setZones] = useState<Zone[]>([])
  const [windows, setWindows] = useState<CaptureWindow[] | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<CaptureWindow | null>(null)

  const plan = user?.plan ?? 'free'
  // A Viewer can read the board but not change it — the API refuses either way.
  const canWrite = can(user?.memberRole, 'write')
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

  const framesTotal = useMemo(() => (windows ? schedulesApi.totalFramesPerDay(windows) : 0), [windows])
  const activeCount = windows?.filter((w) => w.active).length ?? 0

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <h1 className="text-page-title font-bold text-text-primary">Schedule</h1>
        <Button onClick={() => setAddOpen(true)} disabled={zones.length === 0 || !canWrite}>
          Add window
        </Button>
      </div>

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
                    <li key={zone.id} className="grid grid-cols-[160px_1fr] gap-md items-center">
                      <div className="min-w-0">
                        <p className="text-label font-semibold text-text-primary truncate">{zone.name}</p>
                        <p className="text-micro text-text-muted mt-xs">
                          {zone.status === 'paused'
                            ? 'Paused — resume to collect'
                            : `${zoneWindows.length} windows · ${zoneWindows.reduce((s, w) => s + framesPerDay(w), 0)} frames/day`}
                        </p>
                      </div>
                      <div className="relative h-11 bg-canvas-secondary border border-divider rounded-md overflow-hidden">
                        {zone.status === 'paused' && (
                          <span className="absolute inset-0 flex items-center justify-center text-micro text-text-muted">
                            Paused
                          </span>
                        )}
                        {zone.status !== 'paused' &&
                          zoneWindows.map((w) => {
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
              {plan !== 'premium' && <p className="text-caption text-text-muted mt-xs">Unlimited on Premium</p>}
            </div>
          </Card>

          <Card className="p-lg">
            <p className="text-label text-text-secondary">Next collection</p>
            <p className="text-page-title font-bold text-text-primary tabular-nums mt-xs">10:00</p>
            <p className="text-caption text-text-muted mt-xs">in 21 minutes · {activeCount} windows</p>
          </Card>
        </div>
      </div>

      <WindowDialog
        open={addOpen}
        zones={zones}
        plan={plan}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false)
          refetch()
        }}
      />

      {editing && (
        <WindowDialog
          open
          zones={zones}
          plan={plan}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}

/** 3k (add) and 3l (edit + remove) share one dialog. */
function WindowDialog({
  open,
  zones,
  plan,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  zones: Zone[]
  plan: 'free' | 'standard' | 'premium'
  editing?: CaptureWindow
  onClose: () => void
  onSaved: () => void
}) {
  const [zoneId, setZoneId] = useState(editing?.zoneId ?? zones[0]?.id ?? '')
  const [label, setLabel] = useState(editing?.label ?? '')
  const [start, setStart] = useState(editing?.start ?? '06:00')
  const [end, setEnd] = useState(editing?.end ?? '11:00')
  const [interval, setInterval] = useState<CaptureInterval>(editing?.interval ?? 'hourly')
  const [days, setDays] = useState<number[]>(editing?.days ?? [0, 1, 2, 3, 4])
  const [active, setActive] = useState(editing?.active ?? true)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const frames = framesPerDay({ start, end, interval })
  const intervalLocked = (option: CaptureInterval) => option === '15min' && plan !== 'premium'

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await schedulesApi.updateWindow(editing.id, { zoneId, label, start, end, interval, days, active })
      } else {
        await schedulesApi.createWindow({ zoneId, label, start, end, interval, days })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editing) return
    await schedulesApi.deleteWindow(editing.id)
    onSaved()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[30rem] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <Dialog.Title className="text-section-title text-text-primary">
            {editing ? 'Edit window' : 'Add collection window'}
          </Dialog.Title>
          <Dialog.Description className="text-caption text-text-secondary mt-xs mb-lg">
            {editing
              ? `${editing.capturedFrames} frames captured since this window was created.`
              : `The ${PLAN_LABEL[plan]} plan allows ${PLAN_LIMITS[plan].schedulesLimit} active windows.`}
          </Dialog.Description>

          <div className="space-y-lg">
            {error && <Alert variant="warning">{error}</Alert>}

            <div className="space-y-xs">
              <FormLabel htmlFor="window-zone">Zone</FormLabel>
              <Select
                id="window-zone"
                value={zoneId}
                onValueChange={setZoneId}
                options={zones.map((zone) => ({ value: zone.id, label: zone.name }))}
                className="w-full"
                modal={false}
              />
            </div>

            <div className="space-y-xs">
              <FormLabel htmlFor="window-label">Window name</FormLabel>
              <Input id="window-label" placeholder="Morning peak" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div className="space-y-xs">
                <FormLabel htmlFor="window-start">Start</FormLabel>
                <Input id="window-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-xs">
                <FormLabel htmlFor="window-end">End</FormLabel>
                <Input id="window-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>

            <div className="space-y-xs">
              <FormLabel>Interval</FormLabel>
              <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px]">
                {(['15min', 'hourly', 'daily'] as CaptureInterval[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => !intervalLocked(option) && setInterval(option)}
                    className={cn(
                      'flex-1 h-9 rounded-sm text-label transition-colors',
                      interval === option ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2' : 'text-text-secondary',
                      intervalLocked(option) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {INTERVAL_LABEL[option]}
                    {intervalLocked(option) && ' · Premium'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-xs">
              <FormLabel>Days</FormLabel>
              <div className="flex gap-xs">
                {DAY_LABEL.map((label, index) => (
                  <button
                    key={`${label}-${index}`}
                    type="button"
                    aria-label={DAY_NAME[index]}
                    aria-pressed={days.includes(index)}
                    onClick={() => setDays((d) => (d.includes(index) ? d.filter((x) => x !== index) : [...d, index]))}
                    className={cn(
                      'w-10 h-10 rounded-md text-label font-semibold transition-colors',
                      days.includes(index)
                        ? 'bg-primary text-on-primary'
                        : 'bg-canvas border border-border text-text-secondary hover:bg-canvas-secondary'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {editing && (
              <label className="flex items-center gap-sm text-body text-text-secondary">
                <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />
                Window active
              </label>
            )}

            <p className="text-caption text-text-secondary bg-canvas-secondary rounded-md p-md">
              Adds <span className="font-semibold text-text-primary tabular-nums">{frames} frames/day</span> to your
              capture budget.
            </p>
          </div>

          <div className="flex items-center justify-between gap-sm mt-xl">
            {editing ? (
              <button onClick={() => setConfirmRemove(true)} className="text-label text-danger-text hover:underline">
                Remove window
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-sm">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !zoneId}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add window'}
              </Button>
            </div>
          </div>

          {confirmRemove && (
            <div className="mt-lg border border-danger-text/30 bg-danger-bg rounded-md p-md">
              <p className="text-body text-danger-text font-medium">Remove this window?</p>
              <p className="text-caption text-danger-text/80 mt-xs">Frames already captured are kept.</p>
              <div className="flex gap-sm mt-md">
                <Button variant="destructive" size="sm" onClick={remove}>
                  Remove
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
