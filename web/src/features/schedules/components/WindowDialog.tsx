'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { DialogCloseX } from '@/components/ui/DialogCloseX'
import { Button, linkClass } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Alert } from '@/components/ui/Alert'
import { IconCrown, IconTrash } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { PLAN_LABEL, PLAN_LIMITS } from '@/lib/constants'
import type { Plan } from '@/features/auth/types'
import type { Zone } from '@/features/zones/types'
import * as schedulesApi from '../api'
import { DAY_LABEL, DAY_NAME, framesPerDay, type CaptureInterval, type CaptureWindow } from '../types'
import { PLAN_INTERVALS, dayName, latestFittingEnd, planIssue, type PlanIssue } from '../plan-fit'
import { FIELD_COPY, windowError, type WindowError, type WindowField } from '../errors'

/** The dialog's values — also what is parked in sessionStorage while the user looks at plans. */
export interface WindowDraft {
  id: string | null
  zoneId: string
  label: string
  start: string
  end: string
  interval: CaptureInterval
  days: number[]
  active: boolean
}

const DRAFT_KEY = 'maceut.windowDraft'

/** A draft saved before "Upgrade" took the user to the plans, if any. */
export function peekWindowDraft(): WindowDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as WindowDraft) : null
  } catch {
    return null
  }
}

/** Drops the saved draft once its dialog has closed. */
export function forgetWindowDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Storage unavailable: nothing was kept.
  }
}

const INTERVAL_TEXT: Record<CaptureInterval, string> = { '15min': 'Every 15 min', hourly: 'Hourly', daily: 'Daily' }
const NAME_IDEAS = ['Morning rush', 'Evening rush', 'All day']
const WEEKDAYS = [0, 1, 2, 3, 4]
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

/**
 * Add or edit a capture window (3k / 3l, reworked in FE-30).
 *
 * Nothing is greyed out for plan reasons: a locked option carries a crown and can still
 * be picked, and the upgrade panel then says what doesn't fit, with a one-click fix and
 * an upgrade. Field mistakes show under the field as soon as it loses focus. Every
 * message is English, whatever the API said — `windowError` maps by code.
 */
export function WindowDialog({
  open,
  zones,
  windows,
  plan,
  editing,
  initialDraft,
  startWithDelete = false,
  onClose,
  onSaved,
  onPauseOne,
}: {
  open: boolean
  zones: Zone[]
  /** Every window on the account, for the plan checks. */
  windows: CaptureWindow[]
  plan: Plan
  editing?: CaptureWindow
  /** Values to restore — a draft kept while the user looked at plans. */
  initialDraft?: WindowDraft | null
  /** Opened from the row menu's Delete: straight to the confirmation. */
  startWithDelete?: boolean
  onClose: () => void
  onSaved: () => void
  /** "Pause one": close and take the user to the windows list. */
  onPauseOne: () => void
}) {
  const router = useRouter()
  const seed = initialDraft ?? editing
  const [zoneId, setZoneId] = useState(seed?.zoneId ?? zones[0]?.id ?? '')
  const [label, setLabel] = useState(seed?.label ?? '')
  const [start, setStart] = useState(seed?.start ?? '06:00')
  const [end, setEnd] = useState(seed?.end ?? '10:00')
  const [interval, setInterval] = useState<CaptureInterval>(seed?.interval ?? PLAN_INTERVALS[plan].at(-1) ?? 'daily')
  const [days, setDays] = useState<number[]>(seed?.days ?? WEEKDAYS)
  const [active, setActive] = useState(seed?.active ?? true)
  const [touched, setTouched] = useState<Partial<Record<WindowField, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<WindowError | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(startWithDelete)
  const [saving, setSaving] = useState(false)

  const draft = { start, end, interval, days, active }
  const excludeId = editing?.id
  const issue: PlanIssue | null = useMemo(
    () => planIssue(plan, windows, draft, excludeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, windows, start, end, interval, days, active, excludeId],
  )
  const shownIssue = issue ?? (serverError?.kind === 'plan' ? serverError.issue : null)

  // The dialog's own checks, in the same words the API's errors map to.
  const fieldErrors: Partial<Record<WindowField, string>> = {}
  if (!zoneId) fieldErrors.zone = FIELD_COPY.zone
  if (!label.trim()) fieldErrors.label = FIELD_COPY.label
  else if (label.trim().length > 120) fieldErrors.label = FIELD_COPY.labelLong
  if (!start) fieldErrors.start = FIELD_COPY.time
  if (!end) fieldErrors.end = FIELD_COPY.time
  else if (start && interval !== 'daily' && end <= start) fieldErrors.end = FIELD_COPY.order
  if (days.length === 0) fieldErrors.days = FIELD_COPY.days
  if (serverError?.kind === 'field' && !fieldErrors[serverError.field]) fieldErrors[serverError.field] = serverError.message

  // Mistakes in something typed show at once (Save is disabled while they stand, so
  // waiting for a click would hide why); an empty field waits until the user leaves it.
  const typedMistake = (msg?: string) => msg === FIELD_COPY.order || msg === FIELD_COPY.labelLong
  const show = (f: WindowField) =>
    submitted || touched[f] || typedMistake(fieldErrors[f]) || serverError?.kind === 'field' ? fieldErrors[f] : undefined
  const touch = (f: WindowField) => () => setTouched((t) => ({ ...t, [f]: true }))
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setServerError(null)
  }

  const snapshots = interval === 'daily' ? 1 : framesPerDay(draft)
  const unchanged =
    !!editing &&
    editing.zoneId === zoneId &&
    editing.label === label.trim() &&
    editing.start === start &&
    editing.end === end &&
    editing.interval === interval &&
    editing.active === active &&
    [...editing.days].sort().join() === [...days].sort().join()

  /** Why Save can't go ahead yet — the button is disabled and says so on hover. */
  const blockedReason = unchanged
    ? 'Nothing to save yet'
    : Object.keys(fieldErrors).length > 0
      ? 'Fix the highlighted fields'
      : issue
        ? 'Not on your plan — see the note above'
        : null

  function upgrade() {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ id: editing?.id ?? null, zoneId, label, start, end, interval, days, active } satisfies WindowDraft),
      )
    } catch {
      // Private mode: the plans still open, the draft just isn't kept.
    }
    router.push('/profile')
  }

  async function save() {
    setSubmitted(true)
    if (Object.keys(fieldErrors).length > 0) return
    if (unchanged) return onClose()
    setSaving(true)
    setServerError(null)
    try {
      const input = { zoneId, label: label.trim(), start, end, interval, days }
      if (editing) await schedulesApi.updateWindow(editing.id, { ...input, active })
      else await schedulesApi.createWindow(input)
      onSaved()
    } catch (err) {
      setServerError(windowError(err, plan))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editing) return
    setSaving(true)
    try {
      await schedulesApi.deleteWindow(editing.id)
      onSaved()
    } catch (err) {
      setServerError(windowError(err, plan))
      setConfirmRemove(false)
    } finally {
      setSaving(false)
    }
  }

  const alert = serverError?.kind === 'alert' ? serverError : null
  const alertAction = alert && {
    retry: { label: 'Try again', run: save },
    refresh: { label: 'Refresh list', run: onSaved },
    close: { label: 'Close', run: onClose },
    chooseZone: { label: 'Choose another', run: () => setServerError(null) },
  }[alert.action]

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[32rem] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <DialogCloseX disabled={saving} />
          <Dialog.Title className="pr-xl text-section-title text-text-primary">
            {editing ? 'Edit capture window' : 'New capture window'}
          </Dialog.Title>
          <Dialog.Description className="text-caption text-text-secondary mt-xs mb-lg">
            {editing
              ? `${editing.capturedFrames.toLocaleString('en-US')} snapshot${editing.capturedFrames === 1 ? '' : 's'} collected by this window so far.`
              : `Choose when we collect traffic for this zone. Your ${PLAN_LABEL[plan]} plan includes ${PLAN_LIMITS[plan].schedulesLimit} active windows.`}
          </Dialog.Description>

          <div className="space-y-lg">
            {alert && (
              <Alert variant="warning" className="items-center">
                <span className="flex-1">{alert.message}</span>
                {alertAction && (
                  <Button size="sm" variant="secondary" onClick={() => void alertAction.run()}>
                    {alertAction.label}
                  </Button>
                )}
              </Alert>
            )}

            <Field label="Zone" htmlFor="window-zone" error={show('zone')}>
              <Select
                id="window-zone"
                value={zoneId}
                onValueChange={edit(setZoneId)}
                options={zones.map((zone) => ({ value: zone.id, label: zone.name }))}
                className="w-full"
                modal={false}
              />
            </Field>

            <Field
              label="Window name"
              htmlFor="window-label"
              error={show('label')}
              aside={label.length > 100 ? `${label.length}/120` : undefined}
            >
              <Input
                id="window-label"
                placeholder="e.g. Morning rush"
                value={label}
                aria-invalid={!!show('label')}
                onChange={(e) => edit(setLabel)(e.target.value)}
                onBlur={touch('label')}
                className={cn(show('label') && 'border-danger-icon')}
              />
              {!label.trim() && (
                <div className="flex flex-wrap gap-xs mt-sm">
                  {NAME_IDEAS.map((idea) => (
                    <Chip key={idea} onClick={() => edit(setLabel)(idea)}>
                      {idea}
                    </Chip>
                  ))}
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-md">
              <Field label="Starts" htmlFor="window-start" error={show('start')}>
                <Input
                  id="window-start"
                  type="time"
                  value={start}
                  aria-invalid={!!show('start')}
                  onChange={(e) => edit(setStart)(e.target.value)}
                  onBlur={touch('start')}
                  className={cn(show('start') && 'border-danger-icon')}
                />
              </Field>
              <Field
                label="Ends"
                htmlFor="window-end"
                error={show('end')}
                fix={
                  show('end') === FIELD_COPY.order
                    ? {
                        label: 'Swap times',
                        run: () => {
                          setStart(end)
                          setEnd(start)
                          setServerError(null)
                        },
                      }
                    : undefined
                }
              >
                <Input
                  id="window-end"
                  type="time"
                  value={end}
                  aria-invalid={!!show('end')}
                  onChange={(e) => edit(setEnd)(e.target.value)}
                  onBlur={touch('end')}
                  className={cn(show('end') && 'border-danger-icon')}
                />
              </Field>
            </div>

            <Field label="Collect every">
              <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px]">
                {(['15min', 'hourly', 'daily'] as CaptureInterval[]).map((option) => {
                  const locked = !PLAN_INTERVALS[plan].includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={interval === option}
                      title={locked ? 'Not on your plan — pick it to see how to upgrade' : undefined}
                      onClick={() => edit(setInterval)(option)}
                      className={cn(
                        'flex-1 h-9 rounded-sm text-label transition-colors inline-flex items-center justify-center gap-xs',
                        interval === option
                          ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2'
                          : 'text-text-secondary hover:text-text-primary',
                      )}
                    >
                      {INTERVAL_TEXT[option]}
                      {locked && <IconCrown size={14} className="text-primary" aria-label="Upgrade to unlock" />}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field
              label="On these days"
              error={show('days')}
              fix={
                show('days')
                  ? { label: 'Weekdays', run: () => edit(setDays)(WEEKDAYS), second: { label: 'Every day', run: () => edit(setDays)(EVERY_DAY) } }
                  : undefined
              }
            >
              <div className="flex gap-xs">
                {DAY_LABEL.map((dayLabel, index) => (
                  <button
                    key={`${dayLabel}-${index}`}
                    type="button"
                    aria-label={DAY_NAME[index]}
                    aria-pressed={days.includes(index)}
                    onClick={() => {
                      edit(setDays)(days.includes(index) ? days.filter((x) => x !== index) : [...days, index])
                      touch('days')()
                    }}
                    className={cn(
                      'w-10 h-10 rounded-md text-label font-semibold transition-colors',
                      days.includes(index)
                        ? 'bg-primary text-on-primary'
                        : 'bg-canvas border border-border text-text-secondary hover:bg-canvas-secondary',
                    )}
                  >
                    {dayLabel}
                  </button>
                ))}
              </div>
            </Field>

            {editing && (
              <label className="flex items-center justify-between gap-md">
                <span>
                  <span className="block text-body font-semibold text-text-primary">Collecting</span>
                  <span className="block text-caption text-text-muted">Turn off to pause without deleting it.</span>
                </span>
                <Switch checked={active} onCheckedChange={edit(setActive)} aria-label="Collecting" />
              </label>
            )}

            <p
              className={cn(
                'text-caption rounded-md p-md flex items-center gap-xs',
                shownIssue?.kind === 'daily' ? 'bg-primary-soft text-primary' : 'bg-canvas-secondary text-text-secondary',
              )}
            >
              {shownIssue?.kind === 'daily' && <IconCrown size={14} />}
              About <span className="font-semibold tabular-nums">{snapshots} snapshot{snapshots === 1 ? '' : 's'} a day</span>
              {interval !== 'daily' && <> on each day it runs.</>}
            </p>

            {shownIssue && (
              <UpgradePanel
                issue={shownIssue}
                plan={plan}
                fix={fixFor(shownIssue, plan, windows, draft, excludeId, {
                  setInterval: edit(setInterval),
                  setEnd: edit(setEnd),
                  pauseOne: onPauseOne,
                })}
                onUpgrade={upgrade}
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-sm mt-xl">
            {editing ? (
              <Button variant="destructive" onClick={() => setConfirmRemove(true)} disabled={saving || confirmRemove}>
                <IconTrash size={14} />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-sm">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <span title={blockedReason ?? undefined}>
                <Button onClick={() => void save()} disabled={saving || blockedReason !== null}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </span>
            </div>
          </div>

          {confirmRemove && (
            <div className="mt-lg border border-danger-text/30 bg-danger-bg rounded-md p-md">
              <p className="text-body text-danger-text font-medium">Delete this window?</p>
              <p className="text-caption text-danger-text/80 mt-xs">Snapshots it already collected stay in your history.</p>
              <div className="flex gap-sm mt-md">
                <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={saving}>
                  Delete
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface Fix {
  label: string
  run: () => void
  second?: { label: string; run: () => void }
}

/** A labelled control, its error underneath, and an optional one-click fix. */
function Field({
  label,
  htmlFor,
  error,
  aside,
  fix,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string
  aside?: string
  fix?: Fix
  children: React.ReactNode
}) {
  return (
    <div className="space-y-xs">
      <div className="flex items-baseline justify-between gap-sm">
        <FormLabel htmlFor={htmlFor}>{label}</FormLabel>
        {aside && <span className="text-caption text-text-muted tabular-nums">{aside}</span>}
      </div>
      {children}
      {error && (
        <div className="flex flex-wrap items-center gap-sm" role="alert">
          <p className="text-caption text-danger-text">{error}</p>
          {fix && <Chip onClick={fix.run}>{fix.label}</Chip>}
          {fix?.second && <Chip onClick={fix.second.run}>{fix.second.label}</Chip>}
        </div>
      )}
    </div>
  )
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 px-sm rounded-full border border-border bg-canvas text-caption font-semibold text-text-secondary hover:border-primary hover:text-primary transition-colors"
    >
      {children}
    </button>
  )
}

/** The one-click fix offered beside "Upgrade", or none when nothing simple would do. */
function fixFor(
  issue: PlanIssue,
  plan: Plan,
  windows: CaptureWindow[],
  draft: { start: string; end: string; interval: CaptureInterval; days: number[] },
  excludeId: string | undefined,
  act: { setInterval: (i: CaptureInterval) => void; setEnd: (t: string) => void; pauseOne: () => void },
): Fix | undefined {
  if (issue.kind === 'interval') {
    const fallback = PLAN_INTERVALS[plan].includes('hourly') ? 'hourly' : 'daily'
    return { label: `Use ${fallback}`, run: () => act.setInterval(fallback) }
  }
  if (issue.kind === 'windows') return { label: 'Pause one', run: act.pauseOne }
  if (draft.interval === '15min' && PLAN_INTERVALS[plan].includes('hourly')) {
    const hourly = planIssue(plan, windows, { ...draft, interval: 'hourly', active: true }, excludeId)
    if (!hourly) return { label: 'Collect hourly', run: () => act.setInterval('hourly') }
  }
  const end = draft.interval === 'daily' ? null : latestFittingEnd(plan, windows, draft, excludeId)
  return end ? { label: `Trim to ${end}`, run: () => act.setEnd(end) } : undefined
}

/** What doesn't fit the plan, the quick fix, and the way up — one compact brand line. */
function UpgradePanel({ issue, plan, fix, onUpgrade }: { issue: PlanIssue; plan: Plan; fix?: Fix; onUpgrade: () => void }) {
  const message =
    issue.kind === 'interval'
      ? `${INTERVAL_TEXT[issue.interval]} is a ${PLAN_LABEL[issue.needs]} feature.`
      : issue.kind === 'windows'
        ? `You’re using all ${issue.limit} windows on ${PLAN_LABEL[plan]}.`
        : `${dayName(issue.day)} would hit ${issue.frames} snapshots — your plan allows ${issue.limit}.`
  return (
    <div className="rounded-md bg-primary-soft px-md py-sm flex flex-wrap items-center gap-x-sm gap-y-xs" role="status">
      <IconCrown size={14} className="text-primary shrink-0" />
      <p className="text-caption font-medium text-primary">{message}</p>
      <span className="flex items-center gap-sm ml-auto">
        {fix && <Chip onClick={fix.run}>{fix.label}</Chip>}
        {plan !== 'premium' && (
          <button type="button" onClick={onUpgrade} className={linkClass('caption')}>
            Upgrade
          </button>
        )}
      </span>
    </div>
  )
}
