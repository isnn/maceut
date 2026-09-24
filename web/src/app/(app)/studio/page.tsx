'use client'

/**
 * Studio — plays a zone's day back on the map (3m, F-07).
 *
 * Every frame is a real capture. The previous version generated its own traffic curve
 * (a Gaussian morning peak, a softer evening one, a flat overnight base) and scrubbed
 * through numbers that had never touched a road. It looked convincing, which is what
 * made it worse than an empty screen.
 *
 * Geometry is fetched one frame at a time as playback reaches it, with the next frame
 * prefetched and everything played kept in a cache. A capture is ~2 MB full and ~575 KB
 * slimmed, so loading a whole day up front would be tens of megabytes for an animation
 * nobody inspects road-by-road.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Button, buttonClass } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { IconArrowLeft, IconArrowRight, IconPlay, IconPause } from '@/components/ui/icons'
import { cn, formatNumber } from '@/lib/utils'
import { TRAFFIC_COLORS } from '@/lib/constants'
import * as zonesApi from '@/features/zones/api'
import * as studioApi from '@/features/studio/api'
import type { Frame, SlimTraffic } from '@/features/studio/api'
import {
  STYLE_PRESETS,
  renderCapture,
  canvasToPngBlob,
  downloadCanvas,
  recordAnimation,
  downloadBlob,
  preferredVideoType,
  type RenderLayers,
} from '@/features/studio/render'
import { buildZip } from '@/features/studio/zip'
import type { Zone } from '@/features/zones/types'

/** Playback speeds, as milliseconds between frames. */
const SPEEDS = [
  { label: '0.5×', ms: 2000 },
  { label: '1×', ms: 1000 },
  { label: '2×', ms: 500 },
  { label: '4×', ms: 250 },
]

/**
 * BR-017's bands, over the mean jam factor of a frame.
 *
 * The same four states the map itself uses, so the bar under the player and the colours
 * on it cannot tell different stories.
 */
function bandFor(jam: number): { label: string; color: string } {
  if (jam >= 8) return { label: 'Congested', color: TRAFFIC_COLORS.congested! }
  if (jam >= 6) return { label: 'Heavy', color: TRAFFIC_COLORS.heavy! }
  if (jam >= 4) return { label: 'Slow', color: TRAFFIC_COLORS.slow! }
  return { label: 'Normal', color: TRAFFIC_COLORS.normal! }
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${day}T00:00:00+07:00`))
}

export default function StudioPage() {
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [zoneId, setZoneId] = useState<string>('')
  // Keyed by the zone it belongs to, so switching zones needs no reset: a result whose
  // key no longer matches is simply not this zone's, and the page falls back to loading.
  const [loadedFrames, setLoadedFrames] = useState<{ zoneId: string; frames: Frame[] } | null>(null)
  const [day, setDay] = useState<string>('')

  const [rawCurrent, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  /**
   * Geometry already fetched. Playback revisits the same frames constantly and a day is
   * a few dozen at most, so holding them is far cheaper than re-fetching each loop.
   *
   * State rather than a ref because the render reads it — a ref read during render is
   * not guaranteed to be the value React painted with.
   */
  const [traffics, setTraffics] = useState<Record<string, SlimTraffic | null>>({})

  const [styleId, setStyleId] = useState(STYLE_PRESETS[0]!.id)
  const [layers, setLayers] = useState<RenderLayers>({
    basemap: true,
    timestamp: true,
    legend: false,
    boundary: false,
  })
  const [exporting, setExporting] = useState<null | { label: string; done: number; total: number }>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  // Off-screen: the exported image is rendered at its own size, not the preview's.
  const exportCanvas = useRef<HTMLCanvasElement | null>(null)
  /** In-flight ids, so a prefetch and a play tick cannot both fetch the same frame. */
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    zonesApi.getZones().then((next) => {
      setZones(next)
      if (next.length > 0) setZoneId((z) => z || next[0]!.id)
    })
  }, [])

  useEffect(() => {
    if (!zoneId) return
    let cancelled = false
    studioApi.getFrames(zoneId).then((frames) => {
      if (cancelled) return
      setTraffics({})
      inFlight.current.clear()
      setLoadedFrames({ zoneId, frames })
      setDay(studioApi.daysWithFrames(frames)[0] ?? '')
      setCurrent(0)
      setPlaying(false)
    })
    return () => {
      cancelled = true
    }
  }, [zoneId])

  const allFrames = loadedFrames?.zoneId === zoneId ? loadedFrames.frames : null

  const days = useMemo(() => (allFrames ? studioApi.daysWithFrames(allFrames) : []), [allFrames])

  /** Every completed capture on the selected day, oldest first — the full playable range. */
  const dayFrames = useMemo(
    () => (allFrames ?? []).filter((f) => studioApi.wibDate(f.capturedAt) === day),
    [allFrames, day],
  )

  /**
   * The playback/export range within the day, bounded by two capture ids rather than
   * two clock times. Captures land at irregular moments — a manual one at 19:33, the
   * next scheduled one at 19:42 — so a time-of-day range would have to guess which
   * frame a boundary "belongs" to. Anchoring to real frames means every choice in the
   * picker is something that actually exists.
   *
   * Keyed on the day rather than reset by an effect: a chosen range whose `day` no
   * longer matches the selected day is simply not this day's range, and the read below
   * falls back to the full day on its own — the same pattern `loadedFrames` already uses
   * for the zone switch. No effect means no render where the range briefly points at
   * frames that no longer exist.
   */
  const [range, setRange] = useState<{ day: string; startId: string; endId: string } | null>(null)

  function setRangeStartId(id: string) {
    const idx = dayFrames.findIndex((f) => f.id === id)
    // Keeps the range the right way round: pushing the start past the end drags the end
    // along with it, rather than producing an empty range.
    const endId = idx > rangeEndIdx ? id : (rangeEndId ?? id)
    setRange({ day, startId: id, endId })
  }
  function setRangeEndId(id: string) {
    const idx = dayFrames.findIndex((f) => f.id === id)
    const startId = idx < rangeStartIdx ? id : (rangeStartId ?? id)
    setRange({ day, startId, endId: id })
  }
  function resetRange() {
    setRange(null)
  }

  const rangeStartId = range?.day === day ? range.startId : (dayFrames[0]?.id ?? null)
  const rangeEndId = range?.day === day ? range.endId : (dayFrames[dayFrames.length - 1]?.id ?? null)

  const rangeStartIdx = Math.max(
    dayFrames.findIndex((f) => f.id === rangeStartId),
    0,
  )
  const rangeEndIdxFound = dayFrames.findIndex((f) => f.id === rangeEndId)
  const rangeEndIdx = rangeEndIdxFound === -1 ? dayFrames.length - 1 : rangeEndIdxFound

  /**
   * What actually plays and exports — the day, narrowed to the selected range. Every
   * export (single PNG, image set, animation) reads from this and nothing else, so the
   * range the person set is exactly what they get: no separate "export scope" that could
   * silently disagree with what the range picker shows.
   */
  const frames = useMemo(
    () => dayFrames.slice(rangeStartIdx, rangeEndIdx + 1),
    [dayFrames, rangeStartIdx, rangeEndIdx],
  )

  // The range can shrink out from under the raw position — narrowing the end past where
  // playback was, say. Clamped at the point of use rather than reset by an effect, so
  // nudging one boundary does not throw the viewer back to the start of the range, and
  // no render sees `current` pointing past the frames that now exist.
  const current = Math.min(rawCurrent, Math.max(frames.length - 1, 0))

  const frame = frames[current] ?? null

  /** Loads a frame's geometry into the cache, once. */
  const ensureLoaded = useCallback(async (id: string) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    const traffic = await studioApi.getFrameTraffic(id).catch(() => null)
    setTraffics((prev) => (id in prev ? prev : { ...prev, [id]: traffic }))
  }, [])

  // The current frame, and the next one so playback does not stall at each step.
  useEffect(() => {
    if (!frame) return
    if (!(frame.id in traffics)) void ensureLoaded(frame.id)
    const next = frames[current + 1]
    if (next && !(next.id in traffics)) void ensureLoaded(next.id)
  }, [frame, frames, current, traffics, ensureLoaded])


  useEffect(() => {
    if (!playing || frames.length === 0) return
    const timer = setTimeout(() => {
      setCurrent((i) => (i + 1 >= frames.length ? 0 : i + 1))
    }, SPEEDS[speed]!.ms)
    return () => clearTimeout(timer)
  }, [playing, current, frames.length, speed])

  // Checked once on the client. MediaRecorder is absent in some browsers and in SSR,
  // and a disabled button that explains itself beats one that fails when pressed.
  const previewCanvas = useRef<HTMLCanvasElement | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  const canRecord = typeof window !== 'undefined' && preferredVideoType() !== null

  const selectedZone = zones?.find((z) => z.id === zoneId) ?? null
  const zoneRing = selectedZone?.geometry.coordinates[0] as [number, number][] | undefined
  const zoneLabel = selectedZone?.name ?? 'zone'

  const style = STYLE_PRESETS.find((p) => p.id === styleId) ?? STYLE_PRESETS[0]!

  /** Everything renderCapture needs for one frame, minus the canvas. */
  const renderInputFor = useCallback(
    (f: Frame, traffic: SlimTraffic | null, width: number, height: number) => ({
      traffic,
      ring: zoneRing,
      capturedAt: f.capturedAt,
      zoneName: zoneLabel,
      style,
      layers,
      width,
      height,
    }),
    [style, layers, zoneRing, zoneLabel],
  )

  useEffect(() => {
    const canvas = previewCanvas.current
    if (!canvas || !frame) return
    let cancelled = false
    setPreviewBusy(true)
    // 960×600 is the preview's own resolution; the export renders at 1600×1000 so the
    // file does not depend on how wide the browser happens to be.
    renderCapture(canvas, renderInputFor(frame, traffics[frame.id] ?? null, 960, 600)).finally(() => {
      if (!cancelled) setPreviewBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [frame, traffics, renderInputFor])

  /** A frame's traffic — from the cache if playback already loaded it, fetched otherwise. */
  const trafficFor = useCallback(
    (f: Frame) => traffics[f.id] ?? studioApi.getFrameTraffic(f.id).catch(() => null),
    [traffics],
  )

  /** A filename-safe stamp for one export. */
  function stampFor(iso: string): string {
    return iso.slice(0, 16).replace(/[:T]/g, '-')
  }

  /**
   * Exports the frame on screen as a PNG.
   *
   * Rendered at 1600×1000 rather than whatever the preview happens to be, so the file
   * does not change size with the browser window.
   */
  const exportPng = useCallback(async () => {
    if (!frame) return
    setExportError(null)
    setExporting({ label: 'Rendering image', done: 0, total: 1 })
    try {
      const canvas = exportCanvas.current ?? document.createElement('canvas')
      exportCanvas.current = canvas
      await renderCapture(canvas, renderInputFor(frame, await trafficFor(frame), 1600, 1000))
      await downloadCanvas(canvas, `${zoneLabel}-${stampFor(frame.capturedAt)}.png`.replace(/[/\\:*?"<>|]/g, '-'))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export the image.')
    } finally {
      setExporting(null)
    }
  }, [frame, renderInputFor, trafficFor, zoneLabel])

  /**
   * Renders every frame in the selected range as a PNG and bundles them into one ZIP.
   *
   * One file rather than one download per frame: triggering N downloads in a loop is
   * what popup blockers exist to stop, and a person would have to approve each one by
   * hand. The ZIP writer has no external dependency — see studio/zip.ts.
   */
  const exportImages = useCallback(async () => {
    if (frames.length === 0) return
    setExportError(null)
    setPlaying(false)
    try {
      const canvas = exportCanvas.current ?? document.createElement('canvas')
      exportCanvas.current = canvas
      const entries: { name: string; data: Uint8Array }[] = []

      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!
        await renderCapture(canvas, renderInputFor(f, await trafficFor(f), 1600, 1000))
        const blob = await canvasToPngBlob(canvas)
        entries.push({ name: `${String(i + 1).padStart(2, '0')}-${stampFor(f.capturedAt)}.png`, data: new Uint8Array(await blob.arrayBuffer()) })
        setExporting({ label: 'Rendering images', done: i + 1, total: frames.length })
      }

      downloadBlob(buildZip(entries), `${zoneLabel}-${day}-images.zip`.replace(/[/\\:*?"<>|]/g, '-'))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export the images.')
    } finally {
      setExporting(null)
    }
  }, [frames, renderInputFor, trafficFor, zoneLabel, day])

  /**
   * Records the selected range into a WebM.
   *
   * Each frame's geometry is fetched as it is reached rather than all at once — a range
   * can be dozens of frames and each is hundreds of kilobytes.
   */
  const exportAnimation = useCallback(async () => {
    if (frames.length === 0) return
    setExportError(null)
    setPlaying(false)
    try {
      const canvas = exportCanvas.current ?? document.createElement('canvas')
      exportCanvas.current = canvas

      const blob = await recordAnimation({
        canvas,
        frameCount: frames.length,
        holdMs: SPEEDS[speed]!.ms,
        onProgress: (done, total) => setExporting({ label: 'Recording animation', done, total }),
        paint: async (i) => {
          const f = frames[i]!
          await renderCapture(canvas, renderInputFor(f, await trafficFor(f), 1600, 1000))
        },
      })
      downloadBlob(blob, `${zoneLabel}-${day}.webm`.replace(/[/\\:*?"<>|]/g, '-'))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not record the animation.')
    } finally {
      setExporting(null)
    }
  }, [frames, speed, day, renderInputFor, trafficFor, zoneLabel])

  const zone = selectedZone
  const loadingFrame = frame ? !(frame.id in traffics) : false

  if (zones === null) {
    return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />
  }

  if (zones.length === 0) {
    return (
      <EmptyState
        title="No zones yet"
        description="Studio replays what a zone has collected. Create one and give it a capture window first."
        action={
          <Link href="/zones/new" className={buttonClass()}>
            Create a zone
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-page-title font-bold text-text-primary">Studio</h1>
          <p className="text-body text-text-secondary mt-xs">
            Play a zone&rsquo;s day back, frame by frame, from what it actually collected.
          </p>
        </div>
        <div className="flex flex-wrap gap-md">
          <Select
            value={zoneId}
            onValueChange={setZoneId}
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            className="w-56"
            aria-label="Zone"
          />
          {days.length > 0 && (
            <Select
              value={day}
              onValueChange={(next) => {
                setDay(next)
                setCurrent(0)
                setPlaying(false)
              }}
              options={days.map((d) => ({ value: d, label: formatDay(d) }))}
              className="w-44"
              aria-label="Day"
            />
          )}
        </div>
      </div>

      {allFrames === null ? (
        <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : frames.length === 0 ? (
        <EmptyState
          title="Nothing collected yet"
          description={
            zone
              ? `${zone.name} has no completed captures to play. Set a capture window, or run one from the zone page.`
              : 'No completed captures to play.'
          }
          action={
            zone ? (
              <Link href={`/zones/${zone.id}`} className={buttonClass('secondary')}>
                Open zone
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 laptop:grid-cols-[minmax(0,1fr)_320px] gap-xl items-start">
          <div className="space-y-lg min-w-0">
            <Card className="p-lg space-y-lg">
              {/* The preview IS the renderer, not Leaflet with a CSS filter over it. A separate
                  preview would look close and export differently, and the difference would only
                  ever be discovered after someone shipped the file. Panning lives on the zone
                  page; here, fidelity is worth more. */}
              <div className="relative rounded-md overflow-hidden" style={{ background: style.background }}>
                <canvas ref={previewCanvas} className="w-full block" style={{ aspectRatio: '8 / 5' }} />
                {(loadingFrame || previewBusy) && (
                  <span className="absolute top-md right-md text-micro font-semibold bg-canvas text-text-secondary border border-border rounded-xs px-sm py-xs">
                    {loadingFrame ? 'Loading frame…' : 'Drawing…'}
                  </span>
                )}
              </div>

              {/* Transport */}
              <div className="flex flex-wrap items-center gap-md">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPlaying(false)
                    setCurrent((i) => Math.max(i - 1, 0))
                  }}
                  disabled={current === 0}
                  aria-label="Previous frame"
                >
                  <IconArrowLeft size={16} />
                </Button>
                <Button onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
                  <span className="ml-sm">{playing ? 'Pause' : 'Play'}</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPlaying(false)
                    setCurrent((i) => Math.min(i + 1, frames.length - 1))
                  }}
                  disabled={current >= frames.length - 1}
                  aria-label="Next frame"
                >
                  <IconArrowRight size={16} />
                </Button>

                <div className="flex gap-xs ml-auto">
                  {SPEEDS.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => setSpeed(i)}
                      className={cn(
                        'text-micro font-semibold rounded-xs px-sm py-xs transition-colors',
                        speed === i
                          ? 'bg-primary text-on-primary'
                          : 'bg-canvas-secondary text-text-muted hover:text-text-primary',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min={0}
                  max={frames.length - 1}
                  value={current}
                  onChange={(e) => {
                    setPlaying(false)
                    setCurrent(Number(e.target.value))
                  }}
                  aria-label="Frame position"
                  className="w-full accent-primary"
                />
                <p className="text-caption text-text-muted mt-xs tabular-nums">
                  Frame {current + 1} of {frames.length}
                  {frame && (
                    <>
                      <span aria-hidden> · </span>
                      {frame.time} WIB
                      {frame.jamFactorAvg !== null && (
                        <>
                          <span aria-hidden> · </span>
                          jam {frame.jamFactorAvg.toFixed(2)}
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            </Card>

            {/*
              The day at a glance: every frame's congestion, and which of them are in the
              selected range. Bars for the whole day are always drawn — not just the
              range — so narrowing the Timeframe controls is visibly a choice against the
              full day, not an operation on data that has vanished from view.
            */}
            <Card className="p-lg">
              <p className="text-label text-text-secondary mb-md">Congestion through the day</p>
              <div className="flex items-end gap-[2px] h-24">
                {dayFrames.map((f, dayIdx) => {
                  const jam = f.jamFactorAvg ?? 0
                  const band = bandFor(jam)
                  const inRange = dayIdx >= rangeStartIdx && dayIdx <= rangeEndIdx
                  const rangeIdx = dayIdx - rangeStartIdx
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        if (!inRange) return
                        setPlaying(false)
                        setCurrent(rangeIdx)
                      }}
                      disabled={!inRange}
                      title={inRange ? `${f.time} · jam ${jam.toFixed(2)}` : `${f.time} · outside the selected range`}
                      aria-label={`Jump to ${f.time}`}
                      className={cn(
                        'flex-1 min-w-[3px] rounded-t-xs transition-opacity',
                        !inRange
                          ? 'opacity-[0.12] cursor-default'
                          : rangeIdx === current
                            ? 'opacity-100'
                            : 'opacity-45 hover:opacity-80',
                      )}
                      style={{
                        // 10 is HERE's ceiling, so the bar is a share of "road closed"
                        // rather than of whatever the busiest frame happened to be.
                        height: `${Math.max((jam / 10) * 100, 4)}%`,
                        background: band.color,
                      }}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between text-micro text-text-muted mt-sm tabular-nums">
                <span>{dayFrames[0]?.time}</span>
                <span>{dayFrames[dayFrames.length - 1]?.time}</span>
              </div>
            </Card>
          </div>

          <div className="space-y-lg">
            <Card className="p-lg space-y-md">
              <p className="text-label text-text-secondary">This frame</p>
              {frame ? (
                <dl className="space-y-md">
                  <Row label="Time" value={`${frame.time} WIB`} />
                  <Row
                    label="Avg jam factor"
                    value={frame.jamFactorAvg === null ? '—' : frame.jamFactorAvg.toFixed(2)}
                    hint={frame.jamFactorAvg === null ? undefined : bandFor(frame.jamFactorAvg).label}
                  />
                  <Row
                    label="Roads"
                    value={frame.roadsCount === null ? '—' : formatNumber(frame.roadsCount)}
                  />
                </dl>
              ) : (
                <p className="text-body text-text-secondary">No frame selected.</p>
              )}
            </Card>

            <Card className="p-lg">
              <p className="text-label text-text-secondary mb-sm">Day summary</p>
              <dl className="space-y-md">
                <Row label="Frames" value={String(frames.length)} />
                <Row label="Busiest" value={busiest(frames)} />
                <Row label="Quietest" value={quietest(frames)} />
              </dl>
            </Card>

            {/*
              What plays and what exports are the same set — narrowing this narrows both,
              so scrubbing or pressing Play IS the preview of what an export will contain.
              A separate "preview" surface would risk showing something export does not
              actually produce.
            */}
            <Card className="p-lg space-y-md">
              <p className="text-label text-text-secondary">Timeframe</p>
              <p className="text-caption text-text-muted">
                {frames.length} of {dayFrames.length} frames selected
                {dayFrames[0] && dayFrames[dayFrames.length - 1] && (
                  <>
                    {' '}
                    ({dayFrames[0].time}–{dayFrames[dayFrames.length - 1].time} available)
                  </>
                )}
                .
              </p>
              <div className="grid grid-cols-2 gap-sm">
                <div className="space-y-xs">
                  <label className="text-micro text-text-muted" htmlFor="range-start">
                    Start
                  </label>
                  <Select
                    value={rangeStartId ?? ''}
                    onValueChange={setRangeStartId}
                    options={dayFrames.map((f) => ({ value: f.id, label: f.time }))}
                    aria-label="Range start"
                  />
                </div>
                <div className="space-y-xs">
                  <label className="text-micro text-text-muted" htmlFor="range-end">
                    End
                  </label>
                  <Select
                    value={rangeEndId ?? ''}
                    onValueChange={setRangeEndId}
                    options={dayFrames.map((f) => ({ value: f.id, label: f.time }))}
                    aria-label="Range end"
                  />
                </div>
              </div>
              {frames.length !== dayFrames.length && (
                <button onClick={resetRange} className="text-caption text-info hover:underline">
                  Reset to full day
                </button>
              )}
            </Card>

            <Card className="p-lg space-y-md">
              <p className="text-label text-text-secondary">Style</p>
              <Select
                value={styleId}
                onValueChange={setStyleId}
                options={STYLE_PRESETS.map((s) => ({ value: s.id, label: s.name }))}
                aria-label="Image style"
              />
            
              {/* What appears in the exported image. The two looks in the brief differ by
                  exactly these switches — one carries the timestamp block, one does not. */}
              <div className="border-t border-divider pt-md space-y-sm">
                <p className="text-label text-text-secondary">Layers</p>
                {(
                  [
                    ['basemap', 'Basemap'],
                    ['timestamp', 'Timestamp'],
                    ['legend', 'Legend'],
                    ['boundary', 'Zone boundary'],
                  ] as [keyof RenderLayers, string][]
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-sm text-body text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
                      className="shrink-0"
                    />
                    {label}
                  </label>
                ))}
              </div>
            
              <div className="border-t border-divider pt-md space-y-sm">
                <p className="text-label text-text-secondary">Export</p>
                <Button className="w-full" onClick={exportPng} disabled={exporting !== null || !frame}>
                  Download this frame (PNG)
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={exportImages}
                  disabled={exporting !== null || frames.length === 0}
                >
                  Export images in range ({frames.length}) as ZIP
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={exportAnimation}
                  disabled={exporting !== null || frames.length < 2 || !canRecord}
                  title={canRecord ? undefined : 'This browser cannot record video'}
                >
                  Record animation ({frames.length} frames)
                </Button>

                {exporting && (
                  <div className="pt-sm">
                    <ProgressBar value={exporting.done} max={exporting.total} />
                    <p className="text-micro text-text-muted mt-xs tabular-nums">
                      {exporting.label} — {exporting.done} / {exporting.total}
                    </p>
                  </div>
                )}
                {exportError && <p className="text-caption text-danger-text">{exportError}</p>}
                {!canRecord && (
                  <p className="text-caption text-text-muted">
                    Animation recording needs MediaRecorder, which this browser doesn&rsquo;t offer. Still images work.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function busiest(frames: Frame[]): string {
  const scored = frames.filter((f) => f.jamFactorAvg !== null)
  if (scored.length === 0) return '—'
  const top = scored.reduce((a, b) => (a.jamFactorAvg! >= b.jamFactorAvg! ? a : b))
  return `${top.time} · ${top.jamFactorAvg!.toFixed(2)}`
}

function quietest(frames: Frame[]): string {
  const scored = frames.filter((f) => f.jamFactorAvg !== null)
  if (scored.length === 0) return '—'
  const low = scored.reduce((a, b) => (a.jamFactorAvg! <= b.jamFactorAvg! ? a : b))
  return `${low.time} · ${low.jamFactorAvg!.toFixed(2)}`
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
