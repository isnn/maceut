'use client'

/**
 * The zone's cycle history, one snapshot at a time (F-07).
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

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { IconArrowLeft, IconArrowRight, IconClock } from '@/components/ui/icons'
import { cn, formatNumber } from '@/lib/utils'
import { ROAD_CLASS_LABEL } from '@/lib/constants'
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

export function ZoneSnapshots({ zone }: { zone: Zone }) {
  const [cycles, setCycles] = useState<zonesApi.Capture[] | null>(null)
  const [index, setIndex] = useState(0)
  const [detail, setDetail] = useState<zonesApi.CaptureDetail | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)
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

  const selected = cycles?.[index] ?? null

  // Fetch the traffic for whichever cycle the arrows landed on. Keyed by id so a
  // result that arrives after another press is ignored rather than flashing the
  // wrong map.
  useEffect(() => {
    if (!selected || selected.status !== 'done') return
    if (detailFor === selected.id) return

    let cancelled = false
    zonesApi
      .getCapture(selected.id)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        setDetailFor(d.id)
      })
      .catch(() => {
        if (!cancelled) setDetailFor(selected.id)
      })
    return () => {
      cancelled = true
    }
  }, [selected, detailFor])

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

  const traffic = detail && detailFor === selected?.id ? detail.traffic : null

  return (
    <section className="space-y-md">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h2 className="text-section-title text-text-primary">Snapshots</h2>
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
              aria-label="Older snapshot"
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
              aria-label="Newer snapshot"
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
              <span
                className={cn(
                  'inline-block text-micro font-semibold rounded-xs px-sm py-xs',
                  STATUS_STYLE[selected.status],
                )}
              >
                {STATUS_LABEL[selected.status]}
              </span>

              {selected.status === 'done' ? (
                <MapCanvas
                  polygon={zone.geometry}
                  trafficGeoJSON={traffic ?? undefined}
                  className="h-80 rounded-md overflow-hidden"
                />
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
                <Figure label="Trigger" value={selected.trigger === 'scheduled' ? 'Window' : 'Manual'} />
              </dl>

              <div className="border-t border-divider pt-lg">
                <p className="text-label text-text-secondary mb-sm">Files collected</p>
                {selected.filePath ? (
                  <p className="text-body text-text-primary break-all">
                    {selected.filePath}
                    {selected.fileSize !== null && (
                      <span className="text-caption text-text-muted ml-sm">
                        {(selected.fileSize / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-body text-text-secondary">
                    No image file yet — the map above is drawn from this cycle&rsquo;s stored traffic data. Rendered
                    PNGs arrive with the capture engine.
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
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
