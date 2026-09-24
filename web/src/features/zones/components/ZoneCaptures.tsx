'use client'

/**
 * The zone's capture history — one cycle at a time, then all of them (F-07).
 *
 * A cycle is one firing of a capture window, or one manual capture. The arrows step
 * through them newest-first and everything on the panel follows the selection — the
 * map, the figures, the files.
 *
 * Only the selected cycle's traffic is fetched. A zone collecting hourly has hundreds
 * of cycles within a week and each one carries a whole FeatureCollection, so loading
 * the list eagerly would pull megabytes of geometry nobody is looking at. The list is
 * cheap (no traffic); the detail is fetched per press and cached, so stepping back and
 * forth costs one request each way at most.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { Pagination, SortableTh, Table, TableWrap, Td } from '@/components/ui/Table'
import { useTableControls } from '@/components/ui/useTableControls'
import { IconArrowLeft, IconArrowRight, IconClock } from '@/components/ui/icons'
import { cn, formatNumber } from '@/lib/utils'
import { ROAD_CLASS_LABEL, TRAFFIC_COLORS } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { MapCanvas } from './MapCanvas'
import * as zonesApi from '../api'
import type { Zone } from '../types'

const STATUS_LABEL: Record<zonesApi.CaptureStatus, string> = {
  pending: 'Queued',
  processing: 'Collecting…',
  done: 'Collected',
  failed: 'Failed',
  skipped_limit: 'Skipped — daily limit',
  missed: 'Missed — system was down',
}

const STATUS_STYLE: Record<zonesApi.CaptureStatus, string> = {
  pending: 'bg-canvas-secondary text-text-muted border border-border',
  processing: 'bg-primary-soft text-[#5A35F3]',
  done: 'bg-success-bg text-success-text',
  failed: 'bg-danger-bg text-danger-text',
  skipped_limit: 'bg-warning-bg text-warning-text',
  missed: 'bg-warning-bg text-warning-text',
}

/**
 * Lateness, only when it is worth saying.
 *
 * A couple of seconds between due and collected is the pipeline working; showing "2s
 * late" on every row would train people to ignore the field, so it stays quiet until
 * the delay is real.
 */
function lateness(capture: zonesApi.Capture): string | null {
  if (capture.lateBySeconds === null || capture.lateBySeconds < 60) return null
  const minutes = Math.round(capture.lateBySeconds / 60)
  return minutes < 60 ? `${minutes} min late` : `${Math.round(minutes / 60)} h late`
}

/**
 * BR-017's four bands, with the jam-factor range each covers.
 *
 * The map draws coloured lines and, until now, nothing said what the colours meant —
 * green and orange are guessable, but the boundary between "slow" and "heavy" is not,
 * and neither is the fact that 10 means the road is closed. The ranges are the same
 * constants the server colours segments with, so a legend cannot drift from the map.
 */
const JAM_BANDS = [
  { label: 'Normal', range: '0 – 3.9', color: TRAFFIC_COLORS.normal! },
  { label: 'Slow', range: '4 – 5.9', color: TRAFFIC_COLORS.slow! },
  { label: 'Heavy', range: '6 – 7.9', color: TRAFFIC_COLORS.heavy! },
  { label: 'Congested', range: '8 – 10', color: TRAFFIC_COLORS.congested! },
] as const

function JamLegend() {
  return (
    <div className="flex flex-wrap items-center gap-lg">
      <span className="text-label text-text-secondary">Jam factor</span>
      {JAM_BANDS.map((band) => (
        <span key={band.label} className="flex items-center gap-sm">
          <span aria-hidden className="w-6 h-[3px] rounded-full shrink-0" style={{ background: band.color }} />
          <span className="text-caption text-text-secondary">
            {band.label}
            <span className="text-text-muted tabular-nums"> {band.range}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

/** "23 Sep 10:27" in WIB — enough to compare two columns without repeating the year. */
function shortWib(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
    .format(new Date(iso))
    .replace(/\./g, ':')
}

/** "22 Sep 2026 19:27 WIB" — BR-018's format, which the rendered image will also use. */
function formatWib(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
    .format(new Date(iso))
    .replace(/\./g, ':') + ' WIB'
}

export function ZoneCaptures({ zone }: { zone: Zone }) {
  const [cycles, setCycles] = useState<zonesApi.Capture[] | null>(null)
  const [index, setIndex] = useState(0)
  /**
   * Traffic already fetched, keyed by capture id.
   *
   * This used to fetch the FULL capture (~2 MB — street names, per-segment jam factors,
   * functional classes) on every arrow press, with no prefetch: each step blocked on a
   * fresh multi-megabyte request. Studio hit the same wall and solved it with the slim
   * projection (~575 KB) plus a cache; this is that same fix, applied here because
   * stepping is bidirectional — both neighbours are worth having ready, not just "next".
   */
  const [traffics, setTraffics] = useState<Record<string, zonesApi.SlimTraffic | null>>({})
  const inFlight = useRef(new Set<string>())
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    zonesApi
      .getZoneCaptures(zone.id)
      .then(setCycles)
      .catch(() => setCycles([]))
  }, [zone.id])

  useEffect(() => {
    load()
  }, [load])

  // The full history as a list. The stepper answers "what did this look like at 07:00?";
  // the table answers "did everything that was supposed to run actually run?" — which is
  // the question when a zone has gone quiet, and a one-at-a-time view cannot show it.
  const table = useTableControls<zonesApi.Capture>({
    rows: cycles,
    searchOn: (c) => [c.status, c.trigger],
    sortOn: {
      planned: (c) => c.scheduledFor ?? c.capturedAt,
      actual: (c) => c.capturedAt,
      status: (c) => c.status,
      trigger: (c) => c.trigger,
      roads: (c) => c.roadsCount,
      jam: (c) => c.jamFactorAvg,
    },
    defaultDirection: { planned: 'desc', actual: 'desc', roads: 'desc', jam: 'desc' },
    initialSort: { key: 'actual', direction: 'desc' },
    pageSize: 10,
  })

  const selected = cycles?.[index] ?? null

  /** Loads a cycle's traffic into the cache, once. */
  const ensureLoaded = useCallback(async (id: string) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    const traffic = await zonesApi.getCaptureTrafficSlim(id).catch(() => null)
    setTraffics((prev) => (id in prev ? prev : { ...prev, [id]: traffic }))
  }, [])

  // The selected cycle, and both neighbours the arrows can reach next — prefetched so
  // pressing an arrow twice in a row is instant the second time, in either direction.
  useEffect(() => {
    if (!selected || !cycles) return
    if (selected.status === 'done' && !(selected.id in traffics)) void ensureLoaded(selected.id)
    const older = cycles[index + 1]
    const newer = cycles[index - 1]
    if (older?.status === 'done' && !(older.id in traffics)) void ensureLoaded(older.id)
    if (newer?.status === 'done' && !(newer.id in traffics)) void ensureLoaded(newer.id)
  }, [selected, cycles, index, traffics, ensureLoaded])

  async function runNow() {
    setRunning(true)
    setError(null)
    setNotice(null)
    try {
      const res = await zonesApi.runCapture(zone.id)
      if (res.queued) {
        setNotice('Collecting now — the new cycle appears here in a few seconds.')
        // The worker needs a moment; reload once rather than polling forever.
        setTimeout(load, 4000)
      } else {
        setNotice(res.capture.error ?? 'Refused by the daily capture limit.')
        load()
      }
      setIndex(0)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start a capture. Please try again.')
    } finally {
      setRunning(false)
    }
  }

  const traffic = selected ? (traffics[selected.id] ?? null) : null
  const loadingTraffic = selected?.status === 'done' && !(selected.id in traffics)

  return (
    <section className="space-y-md">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h2 className="text-section-title text-text-primary">Captures</h2>
          <p className="text-caption text-text-muted mt-xs">
            Every cycle this zone has collected, newest first.
          </p>
        </div>
        <Button variant="secondary" onClick={runNow} disabled={running}>
          {running ? 'Starting…' : 'Capture now'}
        </Button>
      </div>

      {error && <Alert variant="warning">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {cycles === null ? (
        <div className="h-80 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : cycles.length === 0 ? (
        <EmptyState
          title="No cycles yet"
          description="This zone collects when one of its capture windows comes round. You can also run one now."
        />
      ) : (
        <Card className="p-lg space-y-lg">
          {/* The stepper. Newest is index 0, so "previous" walks back in time. */}
          <div className="flex items-center justify-between gap-md">
            <button
              onClick={() => setIndex((i) => Math.min(i + 1, cycles.length - 1))}
              disabled={index >= cycles.length - 1}
              aria-label="Older capture"
              className={cn(
                'w-10 h-10 rounded-sm border border-border flex items-center justify-center transition-colors',
                'hover:bg-canvas-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
              )}
            >
              <IconArrowLeft size={18} />
            </button>

            <div className="text-center min-w-0">
              <p className="text-body font-semibold text-text-primary flex items-center justify-center gap-sm">
                <IconClock size={16} className="text-text-muted shrink-0" />
                <span className="truncate">{selected ? formatWib(selected.capturedAt) : '—'}</span>
              </p>
              <p className="text-caption text-text-muted mt-xs tabular-nums">
                {index + 1} of {cycles.length}
                {selected && (
                  <>
                    <span aria-hidden> · </span>
                    {selected.trigger === 'scheduled' ? 'Scheduled' : 'Manual'}
                    {lateness(selected) && (
                      <>
                        <span aria-hidden> · </span>
                        <span className="text-warning-text">{lateness(selected)}</span>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>

            <button
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index <= 0}
              aria-label="Newer capture"
              className={cn(
                'w-10 h-10 rounded-sm border border-border flex items-center justify-center transition-colors',
                'hover:bg-canvas-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
              )}
            >
              <IconArrowRight size={18} />
            </button>
          </div>

          {selected && (
            <>
              {/* Only when something went wrong. On a collected cycle the map below says so
                  already, and the table carries status for every row. */}
              {selected.status !== 'done' && (
                <span
                  className={cn(
                    'inline-block text-micro font-semibold rounded-xs px-sm py-xs',
                    STATUS_STYLE[selected.status],
                  )}
                >
                  {STATUS_LABEL[selected.status]}
                </span>
              )}

              {selected.status === 'done' ? (
                <div className="space-y-md">
                  <div className="relative">
                    <MapCanvas
                      polygon={zone.geometry}
                      slimTraffic={traffic}
                      className="h-80 rounded-md overflow-hidden"
                    />
                    {loadingTraffic && (
                      <span className="absolute top-md right-md z-[500] text-micro font-semibold bg-canvas text-text-secondary border border-border rounded-xs px-sm py-xs">
                        Loading…
                      </span>
                    )}
                  </div>
                  <JamLegend />
                </div>
              ) : (
                <div className="h-80 rounded-md bg-canvas-secondary flex items-center justify-center text-center px-xl">
                  <p className="text-body text-text-secondary max-w-[48ch]">
                    {selected.error ??
                      (selected.status === 'pending' || selected.status === 'processing'
                        ? 'This cycle is still collecting. It appears here once the worker finishes.'
                        : 'No traffic was recorded for this cycle.')}
                    {selected.status === 'missed' && selected.scheduledFor && (
                      <span className="block text-caption text-text-muted mt-md">
                        Due {formatWib(selected.scheduledFor)}. Nothing was collected — a frame taken hours late
                        describes a different moment, so it is recorded rather than faked.
                      </span>
                    )}
                  </p>
                </div>
              )}

              <dl className="grid grid-cols-2 tablet:grid-cols-4 gap-lg">
                <Figure label="Roads" value={selected.roadsCount === null ? '—' : formatNumber(selected.roadsCount)} />
                <Figure
                  label="Avg jam factor"
                  value={selected.jamFactorAvg === null ? '—' : selected.jamFactorAvg.toFixed(2)}
                  hint="0 clear · 10 closed"
                />
                <Figure label="Road class" value={ROAD_CLASS_LABEL[selected.roadClass]} />
                <Figure label="Trigger" value={selected.trigger === 'scheduled' ? 'Auto' : 'Manual'} />
              </dl>

            </>
          )}
        </Card>
      )}

      {/* Planned beside actual is the point of this table. `capturedAt` alone cannot tell
          an on-time frame from one taken after an outage, and for traffic data that
          difference is the whole value of the frame. */}
      {cycles !== null && cycles.length > 0 && (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
          <SortableTh
            active={table.sort?.key === 'planned'}
            direction={table.sort?.direction ?? 'asc'}
            onSort={() => table.toggleSort('planned')}
          >
            Time
          </SortableTh>
          <SortableTh
            active={table.sort?.key === 'actual'}
            direction={table.sort?.direction ?? 'asc'}
            onSort={() => table.toggleSort('actual')}
          >
            Collected at
          </SortableTh>
          <SortableTh
            active={table.sort?.key === 'status'}
            direction={table.sort?.direction ?? 'asc'}
            onSort={() => table.toggleSort('status')}
          >
            Status
          </SortableTh>
          <SortableTh
            active={table.sort?.key === 'trigger'}
            direction={table.sort?.direction ?? 'asc'}
            onSort={() => table.toggleSort('trigger')}
          >
            Trigger
          </SortableTh>
          <SortableTh
            className="text-right"
            active={table.sort?.key === 'roads'}
            direction={table.sort?.direction ?? 'asc'}
            onSort={() => table.toggleSort('roads')}
          >
            Roads
          </SortableTh>
          <SortableTh
            className="text-right"
            active={table.sort?.key === 'jam'}
            direction={table.sort?.direction ?? 'asc'}
            onSort={() => table.toggleSort('jam')}
          >
            Avg jam
          </SortableTh>
                </tr>
              </thead>
              <tbody>
                {table.visible.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      const at = cycles.findIndex((x) => x.id === c.id)
                      if (at >= 0) setIndex(at)
                    }}
                    className={cn(
                      'cursor-pointer transition-colors',
                      c.id === selected?.id ? 'bg-primary-soft/40' : 'hover:bg-canvas-secondary/60'
                    )}
                  >
                    <Td className="tabular-nums whitespace-nowrap">
                      {/* A manual capture has no schedule to be measured against, but it is not
                          timeless — it was due the moment someone asked for it. Its own time beats a
                          dash, which reads like missing data. */}
                      {shortWib(c.scheduledFor ?? c.capturedAt)}
                    </Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {c.status === 'missed' ? (
                        <span className="text-text-muted">never ran</span>
                      ) : (
                        <>
                          {shortWib(c.capturedAt)}
                          {lateness(c) && (
                            <span className="block text-micro text-warning-text">{lateness(c)}</span>
                          )}
                        </>
                      )}
                    </Td>
                    <Td>
                      <span className={cn('text-micro font-semibold rounded-xs px-sm py-xs', STATUS_STYLE[c.status])}>
                        {STATUS_LABEL[c.status]}
                      </span>
                    </Td>
                    <Td className="text-text-secondary">
                      {c.trigger === 'scheduled' ? 'Auto' : 'Manual'}
                    </Td>
                    <Td className="text-right tabular-nums text-text-secondary">
                      {c.roadsCount === null ? <span className="text-text-muted">&mdash;</span> : formatNumber(c.roadsCount)}
                    </Td>
                    <Td className="text-right tabular-nums text-text-secondary">
                      {c.jamFactorAvg === null ? <span className="text-text-muted">&mdash;</span> : c.jamFactorAvg.toFixed(2)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination
            page={table.page}
            pageCount={table.pageCount}
            pageSize={table.pageSize}
            onPage={table.setPage}
            matchCount={table.matchCount}
            totalCount={table.totalCount}
            noun="captures"
          />
        </>
      )}
    </section>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-label text-text-secondary">{label}</dt>
      <dd className="text-body font-semibold text-text-primary mt-xs tabular-nums">{value}</dd>
      {hint && <p className="text-micro text-text-muted mt-xs">{hint}</p>}
    </div>
  )
}
