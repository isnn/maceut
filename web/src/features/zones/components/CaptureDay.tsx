'use client'

/**
 * The selected capture's day at a glance, under the zone's captures table: the capture
 * itself, a summary of its day, and the day's congestion as a bar per capture.
 *
 * Moved here from Studio. Studio is for making images; "how did this zone's day go" is
 * a question about the zone, and this page already has the stepper and the table the
 * answer belongs next to. Clicking a bar selects that capture in the stepper above.
 */

import { Card } from '@/components/ui/Card'
import { cn, formatNumber } from '@/lib/utils'
import { TRAFFIC_COLORS } from '@/lib/constants'
import type { Capture } from '../api'

/** BR-017's bands over a capture's mean jam factor — the same four the map colours use. */
function bandFor(jam: number): { label: string; color: string } {
  if (jam >= 8) return { label: 'Congested', color: TRAFFIC_COLORS.congested! }
  if (jam >= 6) return { label: 'Heavy', color: TRAFFIC_COLORS.heavy! }
  if (jam >= 4) return { label: 'Slow', color: TRAFFIC_COLORS.slow! }
  return { label: 'Normal', color: TRAFFIC_COLORS.normal! }
}

/** "YYYY-MM-DD" in Jakarta — the calendar every capture window is written against. */
function wibDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta' }).format(
    new Date(iso),
  )
}

function wibClock(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(
    new Date(iso),
  )
}

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' }).format(
    new Date(iso),
  )
}

function extreme(captures: Capture[], pick: 'max' | 'min'): string {
  const scored = captures.filter((c) => c.jamFactorAvg !== null)
  if (scored.length === 0) return '—'
  const hit = scored.reduce((a, b) =>
    pick === 'max' ? (a.jamFactorAvg! >= b.jamFactorAvg! ? a : b) : a.jamFactorAvg! <= b.jamFactorAvg! ? a : b,
  )
  return `${wibClock(hit.capturedAt)} · ${hit.jamFactorAvg!.toFixed(2)}`
}

export function CaptureDay({
  cycles,
  selectedId,
  onSelect,
}: {
  cycles: Capture[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const selected = cycles.find((c) => c.id === selectedId) ?? null
  // The day of the selected capture — or, if that one never collected, of the newest
  // capture that did, so the section always has a day to describe.
  const anchor = selected?.status === 'done' ? selected : (cycles.find((c) => c.status === 'done') ?? null)
  if (!anchor) return null

  const day = wibDay(anchor.capturedAt)
  // Only collected captures: a missed or failed one has no congestion to chart, and
  // the table above already accounts for it.
  const dayCaptures = cycles
    .filter((c) => c.status === 'done' && wibDay(c.capturedAt) === day)
    .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1))

  return (
    <section className="space-y-md">
      <h3 className="text-heading-sm text-text-primary">{dayLabel(anchor.capturedAt)}</h3>

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
        <Card className="p-lg space-y-md">
          <p className="text-label font-semibold text-text-primary">This frame</p>
          {selected && selected.status === 'done' ? (
            <dl className="space-y-md">
              <Row label="Time" value={`${wibClock(selected.capturedAt)} WIB`} />
              <Row
                label="Avg jam factor"
                value={selected.jamFactorAvg === null ? '—' : selected.jamFactorAvg.toFixed(2)}
                hint={selected.jamFactorAvg === null ? undefined : bandFor(selected.jamFactorAvg).label}
              />
              <Row label="Roads" value={selected.roadsCount === null ? '—' : formatNumber(selected.roadsCount)} />
            </dl>
          ) : (
            <p className="text-body text-text-secondary">This capture collected no traffic.</p>
          )}
        </Card>

        <Card className="p-lg space-y-md">
          <p className="text-label font-semibold text-text-primary">Day summary</p>
          <dl className="space-y-md">
            <Row label="Captures" value={String(dayCaptures.length)} />
            <Row label="Busiest" value={extreme(dayCaptures, 'max')} />
            <Row label="Quietest" value={extreme(dayCaptures, 'min')} />
          </dl>
        </Card>
      </div>

      <Card className="p-lg">
        <p className="text-label font-semibold text-text-primary mb-md">Congestion through the day</p>
        <div className="flex items-end gap-[2px] h-24">
          {dayCaptures.map((c) => {
            const jam = c.jamFactorAvg ?? 0
            const active = c.id === selectedId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                title={`${wibClock(c.capturedAt)} · jam ${jam.toFixed(2)}`}
                aria-label={`Show the ${wibClock(c.capturedAt)} capture`}
                aria-pressed={active}
                className={cn(
                  'flex-1 min-w-[3px] rounded-t-xs transition-opacity',
                  active ? 'opacity-100' : 'opacity-45 hover:opacity-80',
                )}
                style={{
                  // 10 is HERE's ceiling, so a bar is a share of "road closed" rather
                  // than of whatever the busiest capture happened to be.
                  height: `${Math.max((jam / 10) * 100, 4)}%`,
                  background: bandFor(jam).color,
                }}
              />
            )
          })}
        </div>
        <div className="flex justify-between text-micro text-text-muted mt-sm tabular-nums">
          <span>{dayCaptures[0] && wibClock(dayCaptures[0].capturedAt)}</span>
          <span>{dayCaptures.length > 0 && wibClock(dayCaptures[dayCaptures.length - 1]!.capturedAt)}</span>
        </div>
      </Card>
    </section>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-md">
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="text-right">
        <span className="text-body font-semibold text-text-primary tabular-nums">{value}</span>
        {hint && <span className="block text-micro text-text-muted">{hint}</span>}
      </dd>
    </div>
  )
}
