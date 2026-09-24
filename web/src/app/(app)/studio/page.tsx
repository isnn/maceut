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
 *
 * The style rail is five sections — map theme, congestion theme, zoom position, overlay,
 * output size — mirroring a poster tool's Map Style panel rather than one flat preset
 * list. Map theme and congestion theme are kept deliberately separate: BR-017's traffic
 * colours carry real meaning, and a cosmetic map re-skin must never silently touch them
 * (see the "standard" congestion theme's comment in render.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Button, buttonClass } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Checkbox } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { IconArrowLeft, IconArrowRight, IconPlay, IconPause } from '@/components/ui/icons'
import { cn, formatNumber } from '@/lib/utils'
import { TRAFFIC_COLORS } from '@/lib/constants'
import * as zonesApi from '@/features/zones/api'
import * as studioApi from '@/features/studio/api'
import type { Frame, SlimTraffic } from '@/features/studio/api'
import {
  MAP_THEMES,
  CONGESTION_THEMES,
  OUTPUT_SIZES,
  MIN_OUTPUT_PX,
  MAX_OUTPUT_PX,
  DEFAULT_VIEW,
  renderCapture,
  canvasToPngBlob,
  downloadCanvas,
  recordAnimation,
  downloadBlob,
  preferredVideoType,
  type MapThemeCategory,
  type TextPosition,
  type RenderOverlay,
  type RenderView,
  type RenderInput,
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

/** The five overlay-text anchor points, laid out on a 3×3 grid. */
const POSITIONS: { id: TextPosition; label: string; row: number; col: number }[] = [
  { id: 'top-left', label: 'TL', row: 1, col: 1 },
  { id: 'top-right', label: 'TR', row: 1, col: 3 },
  { id: 'center', label: 'C', row: 2, col: 2 },
  { id: 'bottom-left', label: 'BL', row: 3, col: 1 },
  { id: 'bottom-right', label: 'BR', row: 3, col: 3 },
]

const DEFAULT_OVERLAY: RenderOverlay = { showText: true, textPosition: 'bottom-right', legend: false, boundary: false }

/** A preview never needs export resolution — it needs the export's aspect ratio, capped small. */
function previewDims(size: { width: number; height: number }): { width: number; height: number } {
  const maxDim = 960
  if (size.width >= size.height) {
    const width = Math.min(size.width, maxDim)
    return { width, height: Math.round((width / size.width) * size.height) }
  }
  const height = Math.min(size.height, maxDim)
  return { height, width: Math.round((height / size.height) * size.width) }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

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

  // --- style rail state ---------------------------------------------------------
  const [themeId, setThemeId] = useState(MAP_THEMES[0]!.id)
  const [showBasemap, setShowBasemap] = useState(true)
  const [congestionId, setCongestionId] = useState(CONGESTION_THEMES[0]!.id)
  const [view, setView] = useState<RenderView>(DEFAULT_VIEW)
  const [overlay, setOverlay] = useState<RenderOverlay>(DEFAULT_OVERLAY)
  const [outputSizeId, setOutputSizeId] = useState('classic')
  const [customWidth, setCustomWidth] = useState(1600)
  const [customHeight, setCustomHeight] = useState(1000)

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

  const theme = MAP_THEMES.find((t) => t.id === themeId) ?? MAP_THEMES[0]!
  const congestion = CONGESTION_THEMES.find((c) => c.id === congestionId) ?? CONGESTION_THEMES[0]!

  const outputSize = useMemo(() => {
    if (outputSizeId === 'custom') {
      return { width: clamp(customWidth, MIN_OUTPUT_PX, MAX_OUTPUT_PX), height: clamp(customHeight, MIN_OUTPUT_PX, MAX_OUTPUT_PX) }
    }
    return OUTPUT_SIZES.find((s) => s.id === outputSizeId) ?? OUTPUT_SIZES[3]!
  }, [outputSizeId, customWidth, customHeight])

  function selectThemeCategory(next: MapThemeCategory) {
    if (next === theme.category) return
    const first = MAP_THEMES.find((t) => t.category === next)
    if (first) setThemeId(first.id)
  }

  /** Everything renderCapture needs for one frame, minus the canvas. */
  const renderInputFor = useCallback(
    (f: Frame, traffic: SlimTraffic | null, width: number, height: number): RenderInput => ({
      traffic,
      ring: zoneRing,
      capturedAt: f.capturedAt,
      zoneName: zoneLabel,
      theme,
      showBasemap,
      congestion,
      overlay,
      view,
      width,
      height,
    }),
    [theme, showBasemap, congestion, overlay, view, zoneRing, zoneLabel],
  )

  // Off-screen: `renderCapture` paints tiles incrementally as each one loads, so two
  // overlapping renders (a fast theme switch mid-fetch, say) can interleave their
  // `drawImage` calls on a shared canvas — a later tile from a stale run landing after
  // a newer run has already finished. Rendering into a scratch canvas and blitting the
  // result only if this effect is still current keeps a stale run from ever touching
  // what's on screen.
  const previewOffscreen = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = previewCanvas.current
    if (!canvas || !frame) return
    let cancelled = false
    setPreviewBusy(true)
    // The preview renders at a scaled-down version of the chosen output size's own
    // aspect ratio — never a fixed 960×600 — so what's on screen is what will export,
    // just smaller.
    const dims = previewDims(outputSize)
    const offscreen = previewOffscreen.current ?? document.createElement('canvas')
    previewOffscreen.current = offscreen
    renderCapture(offscreen, renderInputFor(frame, traffics[frame.id] ?? null, dims.width, dims.height))
      .then(() => {
        if (cancelled) return
        canvas.width = offscreen.width
        canvas.height = offscreen.height
        canvas.getContext('2d')?.drawImage(offscreen, 0, 0)
      })
      .finally(() => {
        if (!cancelled) setPreviewBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [frame, traffics, renderInputFor, outputSize])

  // --- drag-to-pan on the preview canvas -----------------------------------------
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY }
    setDragging(true)
  }
  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    const canvas = previewCanvas.current
    if (!drag || !canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dx = (e.clientX - drag.x) / rect.width
    const dy = (e.clientY - drag.y) / rect.height
    setView((v) => ({ ...v, panX: clamp(drag.panX + dx, -0.6, 0.6), panY: clamp(drag.panY + dy, -0.6, 0.6) }))
  }
  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Capture may already be released — nothing to do.
    }
  }

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
   * Exports the frame on screen as a PNG, at the selected output size — not whatever
   * the preview happens to be, so the file does not change with the browser window.
   */
  const exportPng = useCallback(async () => {
    if (!frame) return
    setExportError(null)
    setExporting({ label: 'Rendering image', done: 0, total: 1 })
    try {
      const canvas = exportCanvas.current ?? document.createElement('canvas')
      exportCanvas.current = canvas
      await renderCapture(canvas, renderInputFor(frame, await trafficFor(frame), outputSize.width, outputSize.height))
      await downloadCanvas(canvas, `${zoneLabel}-${stampFor(frame.capturedAt)}.png`.replace(/[/\\:*?"<>|]/g, '-'))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export the image.')
    } finally {
      setExporting(null)
    }
  }, [frame, renderInputFor, trafficFor, zoneLabel, outputSize])

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
        await renderCapture(canvas, renderInputFor(f, await trafficFor(f), outputSize.width, outputSize.height))
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
  }, [frames, renderInputFor, trafficFor, zoneLabel, day, outputSize])

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
          await renderCapture(canvas, renderInputFor(f, await trafficFor(f), outputSize.width, outputSize.height))
        },
      })
      downloadBlob(blob, `${zoneLabel}-${day}.webm`.replace(/[/\\:*?"<>|]/g, '-'))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not record the animation.')
    } finally {
      setExporting(null)
    }
  }, [frames, speed, day, renderInputFor, trafficFor, zoneLabel, outputSize])

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
                  ever be discovered after someone shipped the file. Drag the canvas to pan; the
                  zoom slider and Reset live in the Zoom position section. */}
              <div className="relative rounded-md overflow-hidden" style={{ background: theme.background }}>
                <canvas
                  ref={previewCanvas}
                  className="w-full block"
                  style={{ aspectRatio: `${outputSize.width} / ${outputSize.height}`, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
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

            {/* This frame + Day summary describe what's on screen, so they sit under the
                map — the right column is a controls drawer, and these are readouts. */}
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
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
            </div>
          </div>

          {/* Style drawer: on laptop+ the map column stays put while this rail scrolls
              inside its own viewport-height box, and the Export card is pinned to the
              bottom so it's reachable without scrolling past every control first. */}
          <div className="flex flex-col gap-lg min-w-0 laptop:sticky laptop:top-lg laptop:max-h-[calc(100vh-2rem)]">
            <div className="space-y-lg laptop:flex-1 laptop:min-h-0 laptop:overflow-y-auto laptop:pr-xs">
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

            {/* 1. Map theme — the basemap's colour identity: a literal Standard rendering,
                or an Artistic mood. Traffic colours are untouched here on purpose. */}
            <Card className="p-lg space-y-md">
              <p className="text-label text-text-secondary">Map theme</p>
              <div className="flex gap-xs">
                {(['standard', 'artistic'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => selectThemeCategory(cat)}
                    className={cn(
                      'flex-1 text-micro font-semibold rounded-xs px-sm py-xs capitalize transition-colors',
                      theme.category === cat
                        ? 'bg-primary text-on-primary'
                        : 'bg-canvas-secondary text-text-muted hover:text-text-primary',
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-sm">
                {MAP_THEMES.filter((t) => t.category === theme.category).map((t) => {
                  const active = t.id === themeId
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setThemeId(t.id)}
                      className={cn(
                        'rounded-md border p-sm text-left transition-colors',
                        active ? 'border-primary bg-primary-soft/40' : 'border-border hover:bg-canvas-secondary',
                      )}
                    >
                      <div className="h-10 rounded-xs mb-xs relative overflow-hidden" style={{ background: t.background }}>
                        {t.wash && (
                          <div
                            className="absolute inset-0"
                            style={{
                              background: t.wash.color,
                              opacity: Math.min(t.wash.opacity * 2.5, 1),
                              mixBlendMode: t.wash.blend as React.CSSProperties['mixBlendMode'],
                            }}
                          />
                        )}
                      </div>
                      <span className="text-caption text-text-primary">{t.name}</span>
                    </button>
                  )
                })}
              </div>
              <label className="flex items-center gap-sm cursor-pointer">
                <Checkbox checked={showBasemap} onChange={(e) => setShowBasemap(e.target.checked)} />
                <span className="text-label text-text-secondary">Show basemap</span>
              </label>
            </Card>

            {/* 2. Congestion theme — a separate, opt-in recolour of BR-017's four bands.
                Standard is the identity map: choosing it is choosing to keep the meaning. */}
            <Card className="p-lg space-y-sm">
              <p className="text-label text-text-secondary">Congestion theme</p>
              <Select
                value={congestionId}
                onValueChange={setCongestionId}
                options={CONGESTION_THEMES.map((c) => ({ value: c.id, label: c.name }))}
                aria-label="Congestion theme"
              />
              <p className="text-caption text-text-muted">
                Standard keeps the normal/slow/heavy/congested colours as-is. The others trade that meaning for a look.
              </p>
            </Card>

            {/* 3. Zoom position — how far in, and where, the framing sits. Drag the preview
                above to pan; the zoom slider steps in from the automatic fit. */}
            <Card className="p-lg space-y-sm">
              <p className="text-label text-text-secondary">Zoom position</p>
              <div className="flex items-center justify-between text-micro text-text-muted">
                <span>Wider</span>
                <span className="tabular-nums">{view.zoomOffset === 0 ? 'Auto fit' : `${view.zoomOffset > 0 ? '+' : ''}${view.zoomOffset}`}</span>
                <span>Closer</span>
              </div>
              <input
                type="range"
                min={-3}
                max={10}
                step={1}
                value={view.zoomOffset}
                onChange={(e) => setView((v) => ({ ...v, zoomOffset: Number(e.target.value) }))}
                aria-label="Zoom"
                className="w-full accent-primary"
              />
              <p className="text-caption text-text-muted">Drag the preview to reposition it.</p>
              {(view.panX !== 0 || view.panY !== 0 || view.zoomOffset !== 0) && (
                <button onClick={() => setView(DEFAULT_VIEW)} className="text-caption text-info hover:underline">
                  Reset zoom &amp; position
                </button>
              )}
            </Card>

            {/* 4. Overlay — the caption block (name/date/time/day) and the legend, shown
                or hidden and placed independently. */}
            <Card className="p-lg space-y-md">
              <p className="text-label text-text-secondary">Overlay</p>
              <label className="flex items-center gap-sm cursor-pointer">
                <Checkbox checked={overlay.showText} onChange={(e) => setOverlay((o) => ({ ...o, showText: e.target.checked }))} />
                <span className="text-body text-text-secondary">Show text</span>
              </label>
              <div className={cn('grid grid-cols-3 grid-rows-3 gap-xs w-28 h-28 mx-auto', !overlay.showText && 'opacity-40')}>
                {POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!overlay.showText}
                    onClick={() => setOverlay((o) => ({ ...o, textPosition: p.id }))}
                    style={{ gridColumn: p.col, gridRow: p.row }}
                    className={cn(
                      'rounded-xs border text-micro font-semibold flex items-center justify-center transition-colors',
                      overlay.textPosition === p.id
                        ? 'border-primary bg-primary-soft/40 text-primary'
                        : 'border-border text-text-muted hover:bg-canvas-secondary',
                    )}
                    aria-label={`Text position: ${p.label}`}
                    title={p.label}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-divider pt-md space-y-sm">
                <label className="flex items-center gap-sm cursor-pointer">
                  <Checkbox checked={overlay.legend} onChange={(e) => setOverlay((o) => ({ ...o, legend: e.target.checked }))} />
                  <span className="text-body text-text-secondary">Legend</span>
                </label>
                <label className="flex items-center gap-sm cursor-pointer">
                  <Checkbox checked={overlay.boundary} onChange={(e) => setOverlay((o) => ({ ...o, boundary: e.target.checked }))} />
                  <span className="text-body text-text-secondary">Zone boundary</span>
                </label>
              </div>
            </Card>

            {/* 5. Output size — a poster preset, or a custom size within bounds. Classic
                1600×1000 is kept as a preset so an export made before this change and one
                made after it can still match. */}
            <Card className="p-lg space-y-sm">
              <p className="text-label text-text-secondary">Output size</p>
              <Select
                value={outputSizeId}
                onValueChange={setOutputSizeId}
                options={[...OUTPUT_SIZES.map((s) => ({ value: s.id, label: s.name })), { value: 'custom', label: 'Custom' }]}
                aria-label="Output size"
              />
              {outputSizeId === 'custom' && (
                <div className="grid grid-cols-2 gap-sm">
                  <div className="space-y-xs">
                    <label className="text-micro text-text-muted" htmlFor="custom-width">
                      Width
                    </label>
                    <input
                      id="custom-width"
                      type="number"
                      min={MIN_OUTPUT_PX}
                      max={MAX_OUTPUT_PX}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value))}
                      className="w-full h-9 px-sm rounded-xs border border-border bg-canvas text-body text-text-primary tabular-nums"
                    />
                  </div>
                  <div className="space-y-xs">
                    <label className="text-micro text-text-muted" htmlFor="custom-height">
                      Height
                    </label>
                    <input
                      id="custom-height"
                      type="number"
                      min={MIN_OUTPUT_PX}
                      max={MAX_OUTPUT_PX}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value))}
                      className="w-full h-9 px-sm rounded-xs border border-border bg-canvas text-body text-text-primary tabular-nums"
                    />
                  </div>
                </div>
              )}
              <p className="text-caption text-text-muted tabular-nums">
                {outputSize.width} × {outputSize.height}
              </p>
            </Card>
            </div>

            <Card className="p-lg space-y-sm shrink-0">
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
