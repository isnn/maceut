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
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { Input as BaseInput } from '@base-ui/react/input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  IconArrowLeft,
  IconArrowRight,
  IconPlay,
  IconPause,
  IconRotate,
  IconPlus,
  IconMinus,
  IconMove,
} from '@/components/ui/icons'
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
  renderMap,
  renderOverlays,
  canvasToPngBlob,
  downloadCanvas,
  recordAnimation,
  downloadBlob,
  preferredVideoType,
  TEXT_PRESETS,
  captionBox,
  panScale,
  zoomLimits,
  type MapThemeCategory,
  type TextPreset,
  type TextSize,
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

/** The position picker's five presets, laid out on a 3×3 grid. */
const POSITIONS: { id: TextPreset; label: string; row: number; col: number }[] = [
  { id: 'top-left', label: 'Top left', row: 1, col: 1 },
  { id: 'top-right', label: 'Top right', row: 1, col: 3 },
  { id: 'center', label: 'Center', row: 2, col: 2 },
  { id: 'bottom-left', label: 'Bottom left', row: 3, col: 1 },
  { id: 'bottom-right', label: 'Bottom right', row: 3, col: 3 },
]

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
]

const DEFAULT_OVERLAY: RenderOverlay = {
  title: '',
  textSize: 'medium',
  text: TEXT_PRESETS['bottom-right'],
  legend: false,
  boundary: false,
}

/**
 * How far the map can be dragged from its automatic framing, in fitted-view widths —
 * a zone and a half in every direction, at any zoom.
 */
const PAN_LIMIT = 1.5

/**
 * The preview renders at the export's own size, displayed smaller by CSS.
 *
 * It used to be capped at 960px, and that was not just blurrier: `fitZoom` picks the
 * tile zoom from the pixel size, so a 960px preview chose a lower zoom than the
 * 1600px export and showed less street detail than the file actually contained. At
 * the real size the two pick the same zoom and the preview is the export, pixel for
 * pixel. The cap only bites on very large Custom sizes, where rendering every frame
 * at 4000px would stall playback.
 */
function previewDims(size: { width: number; height: number }): { width: number; height: number } {
  const maxDim = 2400
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

  /** Anything not on one of the three main cards lives behind "Other". */
  const otherSize = OUTPUT_SIZES.find((o) => o.id === outputSizeId && o.group === 'more') ?? null
  const otherActive = outputSizeId === 'custom' || otherSize !== null

  function setCustomSize(width: number, height: number) {
    setCustomWidth(width)
    setCustomHeight(height)
    setOutputSizeId('custom')
  }

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
      congestion,
      overlay,
      view,
      width,
      height,
    }),
    [theme, congestion, overlay, view, zoneRing, zoneLabel],
  )

  /**
   * The preview's render queue: at most one render runs, and when it finishes only the
   * NEWEST waiting request runs next — everything in between is dropped unrendered.
   *
   * Without it every state change started its own full-size render, and none was ever
   * aborted. Dragging the map changes state ~60 times a second, and a fast drag piled up
   * dozens of concurrent 1600×1000 renders until the tab ran out of memory and crashed.
   * Each render still gets a NEW scratch canvas and is blitted only when complete, so a
   * half-loaded map never reaches the screen (the torn-tile bug, fixed earlier).
   */
  /**
   * While the map is being dragged, the last rendered image just slides with the
   * pointer (a CSS transform — free), and the real render happens once, on release.
   * Re-rendering per pointer move is what crashed the tab.
   */
  const [slide, setSlide] = useState<{ x: number; y: number } | null>(null)
  /** The view a released slide is waiting on; the slide clears when that view is on screen. */
  const slideTarget = useRef<RenderView | null>(null)

  const renderQueue = useRef<{ running: boolean; next: (() => Promise<void>) | null }>({ running: false, next: null })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const schedulePreview = useCallback((job: () => Promise<void>) => {
    const queue = renderQueue.current
    queue.next = job
    if (queue.running) return
    queue.running = true
    setPreviewBusy(true)
    void (async () => {
      while (queue.next) {
        const run = queue.next
        queue.next = null
        await run().catch(() => undefined)
      }
      queue.running = false
      if (mounted.current) setPreviewBusy(false)
    })()
  }, [])

  useEffect(() => {
    if (!frame) return
    // The preview renders at the output size's own aspect ratio, so what's on screen
    // is what will export.
    const dims = previewDims(outputSize)
    const input = renderInputFor(frame, traffics[frame.id] ?? null, dims.width, dims.height)
    schedulePreview(async () => {
      const offscreen = document.createElement('canvas')
      await renderMap(offscreen, input)
      const canvas = previewCanvas.current
      if (!canvas || !mounted.current) return
      canvas.width = offscreen.width
      canvas.height = offscreen.height
      canvas.getContext('2d')?.drawImage(offscreen, 0, 0)
      if (slideTarget.current === input.view) {
        slideTarget.current = null
        setSlide(null)
      }
    })
  }, [frame, traffics, renderInputFor, outputSize, schedulePreview])

  // The overlay layer — caption, legend, credit — redrawn straight away on its own
  // canvas. It's cheap and synchronous, so a caption drag or a title keystroke never
  // waits behind a map render, and the caption stays put while the map slides under it.
  const overlayCanvas = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = overlayCanvas.current
    if (!canvas || !frame) return
    const dims = previewDims(outputSize)
    renderOverlays(canvas, renderInputFor(frame, null, dims.width, dims.height))
  }, [frame, renderInputFor, outputSize])

  // The slider's real range for this zone and size — past the basemap's deepest zoom
  // the image stops changing, so offering those steps would be a dead slider.
  const previewSize = previewDims(outputSize)
  const zoomRange = frame
    ? zoomLimits(renderInputFor(frame, null, previewSize.width, previewSize.height))
    : { min: -3, max: 10 }
  const zoomOffset = clamp(view.zoomOffset, zoomRange.min, zoomRange.max)
  const zoomLabel =
    zoomOffset === 0
      ? 'Auto fit'
      : `${zoomOffset > 0 ? '+' : ''}${Number.isInteger(zoomOffset) ? zoomOffset : zoomOffset.toFixed(2).replace(/0$/, '')}`

  /**
   * Mouse-wheel zoom on the preview, toward the pointer: the spot under the cursor stays
   * under it, the way every web map behaves. A native listener rather than React's
   * `onWheel`, which is passive — it can't stop the page scrolling at the same time.
   */
  const wheelRange = useRef(zoomRange)
  useEffect(() => {
    wheelRange.current = zoomRange
  })
  const hasPreview = frames.length > 0
  useEffect(() => {
    // The overlay canvas is the top layer, so it's the one the wheel lands on.
    const canvas = overlayCanvas.current
    if (!hasPreview || !canvas) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = canvas!.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      // Where the pointer is, from the image centre, as fractions of the image.
      const sx = (e.clientX - rect.left) / rect.width - 0.5
      const sy = (e.clientY - rect.top) / rect.height - 0.5
      // Line-mode deltas (Firefox) are ~3 per notch; pixel-mode ~100. One notch = ¼ step.
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
      const { min, max } = wheelRange.current
      setView((v) => {
        const from = clamp(v.zoomOffset, min, max)
        const to = clamp(Math.round((from - delta / 400) * 100) / 100, min, max)
        if (to === from) return v
        // Screen offset of a point = (its offset from the data centre + pan) × zoom
        // factor, all in fitted-view units. Solve for the pan that keeps the point
        // under the pointer at the same screen offset after the zoom.
        const before = 2 ** from
        const after = 2 ** to
        const pointX = sx / before - v.panX
        const pointY = sy / before - v.panY
        return {
          zoomOffset: to,
          panX: clamp(sx / after - pointX, -PAN_LIMIT, PAN_LIMIT),
          panY: clamp(sy / after - pointY, -PAN_LIMIT, PAN_LIMIT),
        }
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [hasPreview])

  // --- dragging on the preview: the caption if the pointer is on it, the map if not ---
  type Drag =
    | { kind: 'map'; x: number; y: number; panX: number; panY: number; scale: number }
    | { kind: 'text'; x: number; y: number; cx: number; cy: number; w: number }
  const dragRef = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState<Drag['kind'] | null>(null)
  const [overCaption, setOverCaption] = useState(false)

  /** Exactly what the preview is drawn with — so the grab area is exactly the drawn text. */
  function previewInput(): RenderInput | null {
    if (!frame) return null
    const dims = previewDims(outputSize)
    return renderInputFor(frame, traffics[frame.id] ?? null, dims.width, dims.height)
  }

  function hitsCaption(e: React.PointerEvent<HTMLCanvasElement>, input: RenderInput): boolean {
    const box = captionBox(input)
    if (!box) return false
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * input.width
    const py = ((e.clientY - rect.top) / rect.height) * input.height
    const slop = input.height * 0.01
    return px >= box.x - slop && px <= box.x + box.width + slop && py >= box.y - slop && py <= box.y + box.height + slop
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const input = previewInput()
    if (!input) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const box = hitsCaption(e, input) ? captionBox(input) : null
    if (box) {
      // Start from where the caption is actually drawn — after clamping to the edge
      // margin — not from its stored anchor, so a caption parked against an edge moves
      // the moment it is dragged instead of after a dead zone.
      dragRef.current = {
        kind: 'text',
        x: e.clientX,
        y: e.clientY,
        cx: (box.x + box.width / 2) / input.width,
        cy: (box.y + box.height / 2) / input.height,
        w: box.width / input.width,
      }
    } else {
      dragRef.current = { kind: 'map', x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY, scale: panScale(input) }
    }
    setDragging(dragRef.current.kind)
  }
  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const drag = dragRef.current
    if (!drag) {
      const input = previewInput()
      const over = input !== null && hitsCaption(e, input)
      if (over !== overCaption) setOverCaption(over)
      return
    }
    const dx = (e.clientX - drag.x) / rect.width
    const dy = (e.clientY - drag.y) / rect.height
    if (drag.kind === 'text') {
      // The alignment follows where the caption is: left third reads left-aligned,
      // right third right-aligned, middle centred. Keeping the alignment it started
      // with left a caption dragged from the right corner hanging off its name's end.
      const cx = clamp(drag.cx + dx, 0, 1)
      const cy = clamp(drag.cy + dy, 0, 1)
      const align = cx < 1 / 3 ? 'left' : cx > 2 / 3 ? 'right' : 'center'
      const x = align === 'left' ? cx - drag.w / 2 : align === 'right' ? cx + drag.w / 2 : cx
      setOverlay((o) => ({ ...o, text: { x, y: cy, align } }))
    } else {
      // Clamped here too, so the slide never shows more than the release will keep.
      const panX = clamp(drag.panX + dx / drag.scale, -PAN_LIMIT, PAN_LIMIT)
      const panY = clamp(drag.panY + dy / drag.scale, -PAN_LIMIT, PAN_LIMIT)
      setSlide({ x: (panX - drag.panX) * drag.scale * rect.width, y: (panY - drag.panY) * drag.scale * rect.height })
    }
  }
  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (drag?.kind === 'map' && slide) {
      // Commit the slide as a pan — divided by the zoom factor, because the pan is
      // stored in fitted-view units — so the map tracks the pointer 1:1 at any zoom.
      // The slide stays until that view's render is on screen — clearing it now would
      // snap the old image back for the length of the render, then jump forward.
      const rect = e.currentTarget.getBoundingClientRect()
      const next = {
        ...view,
        panX: clamp(drag.panX + slide.x / rect.width / drag.scale, -PAN_LIMIT, PAN_LIMIT),
        panY: clamp(drag.panY + slide.y / rect.height / drag.scale, -PAN_LIMIT, PAN_LIMIT),
      }
      slideTarget.current = next
      setView(next)
    } else {
      setSlide(null)
    }
    dragRef.current = null
    setDragging(null)
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
        <div className="grid grid-cols-1 laptop:grid-cols-[minmax(0,1fr)_360px] gap-xl items-start">
          <div className="space-y-lg min-w-0">
            <Card className="p-lg space-y-lg">
              {/* The preview IS the renderer, not Leaflet with a CSS filter over it. A separate
                  preview would look close and export differently, and the difference would only
                  ever be discovered after someone shipped the file. Drag the canvas to pan; the
                  zoom slider and Reset live in the Zoom position section. */}
              {/* Two stacked canvases: the map underneath (slides while dragged, renders
                  once on release) and the overlays on top (redrawn instantly). The export
                  composes the same two layers into one image. Width is capped by the
                  viewport height, so a portrait poster doesn't run off the screen. */}
              <div
                className="relative mx-auto rounded-md overflow-hidden"
                style={{
                  background: theme.background,
                  aspectRatio: `${outputSize.width} / ${outputSize.height}`,
                  width: `min(100%, calc(72vh * ${outputSize.width / outputSize.height}))`,
                }}
              >
                <canvas
                  ref={previewCanvas}
                  className="absolute inset-0 w-full h-full"
                  style={{ transform: slide ? `translate(${slide.x}px, ${slide.y}px)` : undefined }}
                />
                <canvas
                  ref={overlayCanvas}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    cursor: dragging === 'text' || (!dragging && overCaption) ? 'move' : dragging ? 'grabbing' : 'grab',
                    touchAction: 'none',
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
                {(loadingFrame || previewBusy) && (
                  <span className="absolute top-md right-md text-micro font-semibold bg-canvas text-text-secondary border border-border rounded-xs px-sm py-xs pointer-events-none">
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

            {/* This frame + Day summary describe what's on screen, so they sit under the
                map — the right column is a controls drawer, and these are readouts. */}
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
              <Card className="p-lg space-y-md">
                <SectionLabel>This frame</SectionLabel>
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
                <SectionLabel className="mb-sm">Day summary</SectionLabel>
                <dl className="space-y-md">
                  <Row label="Frames" value={String(frames.length)} />
                  <Row label="Busiest" value={busiest(frames)} />
                  <Row label="Quietest" value={quietest(frames)} />
                </dl>
              </Card>
            </div>

            {/*
              The day at a glance, kept bottommost — after the frame and day readouts —
              because it summarises the whole day rather than the moment on screen. Bars
              for the whole day are always drawn, not just the range, so narrowing the
              Timeframe controls is visibly a choice against the full day, not an
              operation on data that has vanished from view.
            */}
            <Card className="p-lg">
              <SectionLabel className="mb-md">Congestion through the day</SectionLabel>
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
              <SectionLabel>Timeframe</SectionLabel>
              <div className="grid grid-cols-2 gap-sm">
                <div className="space-y-xs">
                  <label className="text-micro font-semibold uppercase tracking-wider text-text-muted" htmlFor="range-start">
                    Start
                  </label>
                  <Select
                    id="range-start"
                    className="w-full"
                    value={rangeStartId ?? ''}
                    onValueChange={setRangeStartId}
                    options={dayFrames.map((f) => ({ value: f.id, label: f.time }))}
                    aria-label="Range start"
                  />
                </div>
                <div className="space-y-xs">
                  <label className="text-micro font-semibold uppercase tracking-wider text-text-muted" htmlFor="range-end">
                    End
                  </label>
                  <Select
                    id="range-end"
                    className="w-full"
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
              <SectionLabel>Map theme</SectionLabel>
              <Segmented
                ariaLabel="Theme category"
                value={theme.category}
                onChange={selectThemeCategory}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'artistic', label: 'Artistic' },
                ]}
              />
              <p className="text-micro font-semibold uppercase tracking-wider text-text-muted">
                {theme.category} theme
              </p>
              <div className="grid grid-cols-2 gap-sm">
                {MAP_THEMES.filter((t) => t.category === theme.category).map((t) => (
                  <SwatchCard
                    key={t.id}
                    name={t.name}
                    swatch={t.swatch}
                    active={t.id === themeId}
                    wrapped={t.category === 'artistic'}
                    onSelect={() => setThemeId(t.id)}
                  />
                ))}
              </div>
            </Card>

            {/* 2. Congestion theme — a separate, opt-in recolour of BR-017's four bands.
                Standard is the identity map: choosing it is choosing to keep the meaning. */}
            <Card className="p-lg space-y-md">
              <SectionLabel>Congestion theme</SectionLabel>
              <div className="grid grid-cols-2 gap-sm">
                {CONGESTION_THEMES.map((c) => (
                  <SwatchCard
                    key={c.id}
                    name={c.name}
                    swatch={c.bands.map((b) => b.color)}
                    active={c.id === congestionId}
                    wrapped
                    onSelect={() => setCongestionId(c.id)}
                  />
                ))}
              </div>
            </Card>

            {/* 3. Zoom & position — how far in, and where, the framing sits. The map
                itself also takes a drag (pan) and the mouse wheel (zoom). */}
            <Card className="p-lg space-y-md">
              <div className="flex items-center justify-between gap-sm">
                <SectionLabel>Zoom &amp; position</SectionLabel>
                <div className="flex items-center gap-xs">
                  <span className="text-micro font-semibold tabular-nums text-text-secondary bg-canvas-secondary rounded-xs px-sm py-xs">
                    {zoomLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setView(DEFAULT_VIEW)}
                    disabled={view.panX === 0 && view.panY === 0 && view.zoomOffset === 0}
                    aria-label="Reset zoom and position"
                    title="Reset zoom and position"
                    className="grid place-items-center h-8 w-8 rounded-md text-text-secondary hover:bg-canvas-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <IconRotate size={16} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-sm">
                <button
                  type="button"
                  onClick={() => setView((v) => ({ ...v, zoomOffset: clamp(zoomOffset - 0.5, zoomRange.min, zoomRange.max) }))}
                  disabled={zoomOffset <= zoomRange.min}
                  aria-label="Zoom out"
                  title="Zoom out"
                  className="grid place-items-center h-8 w-8 shrink-0 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-canvas-secondary disabled:opacity-30 transition-colors"
                >
                  <IconMinus size={14} />
                </button>
                <input
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={0.25}
                  value={zoomOffset}
                  onChange={(e) => setView((v) => ({ ...v, zoomOffset: Number(e.target.value) }))}
                  aria-label="Zoom"
                  className="flex-1 min-w-0 accent-primary"
                />
                <button
                  type="button"
                  onClick={() => setView((v) => ({ ...v, zoomOffset: clamp(zoomOffset + 0.5, zoomRange.min, zoomRange.max) }))}
                  disabled={zoomOffset >= zoomRange.max}
                  aria-label="Zoom in"
                  title="Zoom in"
                  className="grid place-items-center h-8 w-8 shrink-0 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-canvas-secondary disabled:opacity-30 transition-colors"
                >
                  <IconPlus size={14} />
                </button>
              </div>
            </Card>

            {/* 4. Overlay — the caption (its words, size and place), the legend and the
                zone outline. */}
            <Card className="p-lg space-y-md">
              <SectionLabel>Overlay</SectionLabel>
              <div className="space-y-xs">
                <label htmlFor="caption-title" className="text-micro font-semibold uppercase tracking-wider text-text-muted">
                  Title
                </label>
                <Input
                  id="caption-title"
                  value={overlay.title}
                  onChange={(e) => {
                    const title = e.target.value
                    setOverlay((o) => ({ ...o, title }))
                  }}
                  placeholder={zoneLabel}
                  maxLength={60}
                />
              </div>
              <div className="space-y-xs">
                <p className="text-micro font-semibold uppercase tracking-wider text-text-muted">Text size</p>
                <Segmented
                  ariaLabel="Text size"
                  value={overlay.textSize}
                  onChange={(textSize) => setOverlay((o) => ({ ...o, textSize }))}
                  options={TEXT_SIZES}
                />
              </div>
              <div className={cn('space-y-sm', overlay.textSize === 'none' && 'opacity-40 pointer-events-none')}>
                <p className="text-micro font-semibold uppercase tracking-wider text-text-muted">Position</p>
                {/* A miniature of the output: the five snap points, and a marker for
                    where the caption actually is — which may be none of them once it
                    has been dragged. */}
                <div
                  className="relative mx-auto rounded-md border border-border overflow-hidden max-w-full"
                  style={{
                    aspectRatio: `${outputSize.width} / ${outputSize.height}`,
                    width: outputSize.width >= outputSize.height ? '100%' : `${(outputSize.width / outputSize.height) * 11}rem`,
                    background: theme.background,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute flex flex-col gap-[3px] pointer-events-none"
                    style={{
                      left: `${overlay.text.x * 100}%`,
                      top: `${overlay.text.y * 100}%`,
                      alignItems:
                        overlay.text.align === 'left' ? 'flex-start' : overlay.text.align === 'center' ? 'center' : 'flex-end',
                      transform: `translate(${overlay.text.align === 'left' ? '0' : overlay.text.align === 'center' ? '-50%' : '-100%'}, -50%)`,
                    }}
                  >
                    <span className="block h-[5px] w-12 rounded-full" style={{ background: theme.overlayText }} />
                    <span className="block h-[3px] w-8 rounded-full opacity-70" style={{ background: theme.overlayText }} />
                    <span className="block h-[3px] w-10 rounded-full opacity-50" style={{ background: theme.overlayText }} />
                  </span>
                  {POSITIONS.map((p) => {
                    const preset = TEXT_PRESETS[p.id]
                    const active =
                      overlay.text.x === preset.x && overlay.text.y === preset.y && overlay.text.align === preset.align
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setOverlay((o) => ({ ...o, text: preset }))}
                        aria-label={`Text position: ${p.label}`}
                        aria-pressed={active}
                        title={p.label}
                        className={cn(
                          'absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-transform hover:scale-125',
                          active ? 'bg-primary border-canvas' : 'bg-canvas/80 border-primary',
                        )}
                        style={{ left: `${preset.x * 100}%`, top: `${preset.y * 100}%` }}
                      />
                    )
                  })}
                </div>
                <p className="flex items-center justify-center gap-xs text-caption text-text-muted">
                  <IconMove size={14} />
                  Or drag the text on the preview to place it anywhere.
                </p>
              </div>
              <div className="border-t border-divider pt-md space-y-md">
                <div className="flex items-center justify-between gap-md">
                  <label htmlFor="toggle-legend" className="text-body text-text-primary">
                    Legend
                  </label>
                  <Switch
                    id="toggle-legend"
                    checked={overlay.legend}
                    onCheckedChange={(legend) => setOverlay((o) => ({ ...o, legend }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-md">
                  <label htmlFor="toggle-boundary" className="text-body text-text-primary">
                    Zone boundary
                  </label>
                  <Switch
                    id="toggle-boundary"
                    checked={overlay.boundary}
                    onCheckedChange={(boundary) => setOverlay((o) => ({ ...o, boundary }))}
                  />
                </div>
              </div>
            </Card>

            {/* 5. Output size — the three poster shapes as cards, the rest behind "Other",
                and the exact pixels, editable, underneath. */}
            <Card className="p-lg space-y-md">
              <SectionLabel>Output size</SectionLabel>
              <div className="grid grid-cols-2 gap-sm">
                {OUTPUT_SIZES.filter((o) => o.group === 'main').map((o) => (
                  <SizeCard
                    key={o.id}
                    title={o.name}
                    detail={`${o.width} × ${o.height}`}
                    active={outputSizeId === o.id}
                    onSelect={() => setOutputSizeId(o.id)}
                  />
                ))}
                <SizeCard
                  title="Other"
                  detail={otherActive ? (otherSize?.name ?? 'Custom') : 'More sizes'}
                  active={otherActive}
                  onSelect={() => {
                    if (!otherActive) setOutputSizeId(OUTPUT_SIZES.find((o) => o.group === 'more')!.id)
                  }}
                />
              </div>
              {otherActive && (
                <Select
                  value={outputSizeId}
                  onValueChange={setOutputSizeId}
                  options={[
                    ...OUTPUT_SIZES.filter((o) => o.group === 'more').map((o) => ({
                      value: o.id,
                      label: `${o.name} · ${o.width} × ${o.height}`,
                    })),
                    { value: 'custom', label: 'Custom' },
                  ]}
                  className="w-full"
                  aria-label="More sizes"
                />
              )}
              {/* The exact pixels. Typing here makes the size custom. */}
              <div className="flex items-center justify-center gap-sm rounded-xl border border-dashed border-border bg-canvas-secondary/60 px-md py-sm">
                <BaseInput
                  type="number"
                  aria-label="Width in pixels"
                  min={MIN_OUTPUT_PX}
                  max={MAX_OUTPUT_PX}
                  value={outputSizeId === 'custom' ? customWidth : outputSize.width}
                  onValueChange={(value) => setCustomSize(Number(value), outputSizeId === 'custom' ? customHeight : outputSize.height)}
                  className="w-full min-w-0 bg-transparent text-center text-heading-sm font-bold tabular-nums text-text-primary rounded-sm py-xs focus:outline-none focus-visible:bg-canvas"
                />
                <span aria-hidden className="text-text-muted">
                  ×
                </span>
                <BaseInput
                  type="number"
                  aria-label="Height in pixels"
                  min={MIN_OUTPUT_PX}
                  max={MAX_OUTPUT_PX}
                  value={outputSizeId === 'custom' ? customHeight : outputSize.height}
                  onValueChange={(value) => setCustomSize(outputSizeId === 'custom' ? customWidth : outputSize.width, Number(value))}
                  className="w-full min-w-0 bg-transparent text-center text-heading-sm font-bold tabular-nums text-text-primary rounded-sm py-xs focus:outline-none focus-visible:bg-canvas"
                />
              </div>
            </Card>
            </div>

            <Card className="p-lg space-y-sm shrink-0">
              <SectionLabel>Export</SectionLabel>
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

/**
 * A theme picker card: overlapping colour circles over the name, after the reference
 * the user gave (MapToPoster's Map Style panel). Map themes and congestion themes use
 * the same card, so the two choices read as the same kind of choice.
 */
function SwatchCard({
  name,
  swatch,
  active,
  wrapped,
  onSelect,
}: {
  name: string
  swatch: string[]
  active: boolean
  /** A soft background on unselected cards; Standard map themes go without. */
  wrapped: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center gap-sm rounded-lg border px-sm py-md transition-colors',
        active
          ? 'border-text-primary bg-canvas-secondary'
          : wrapped
            ? 'border-divider bg-canvas-secondary/60 hover:border-border'
            : 'border-transparent hover:bg-canvas-secondary/60',
      )}
    >
      <span className="flex" aria-hidden>
        {swatch.map((color, i) => (
          <span
            key={color + i}
            className={cn('h-7 w-7 rounded-full ring-2 ring-canvas', i > 0 && '-ml-sm')}
            style={{ background: color }}
          />
        ))}
      </span>
      <span className="text-label font-semibold text-text-primary">{name}</span>
    </button>
  )
}

/** A pill-style segmented control — the category switch and the text-size picker. */
function Segmented<T extends string>({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex p-xs rounded-lg bg-canvas-secondary">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 h-9 rounded-md text-label font-semibold transition-colors',
            value === o.value ? 'bg-text-primary text-on-primary shadow-elevation-2' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** An output-size card: the shape's name over its pixels, after the user's reference. */
function SizeCard({
  title,
  detail,
  active,
  onSelect,
}: {
  title: string
  detail: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center gap-xs rounded-xl border px-sm py-md transition-colors',
        active
          ? 'bg-primary border-primary text-on-primary shadow-elevation-2'
          : 'bg-canvas-secondary/60 border-divider text-text-primary hover:border-border',
      )}
    >
      <span className="text-heading-sm font-bold">{title}</span>
      <span className={cn('text-caption tabular-nums', active ? 'text-on-primary/85' : 'text-text-secondary')}>{detail}</span>
    </button>
  )
}

/** Every card's heading, in one style, so the drawer reads as one set of controls. */
function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-label font-semibold text-text-primary', className)}>{children}</p>
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
