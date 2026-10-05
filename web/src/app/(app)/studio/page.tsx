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
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignTop,
  IconAlignMiddle,
  IconAlignBottom,
  IconDownload,
} from '@/components/ui/icons'
import { Dialog } from '@base-ui/react/dialog'
import { cn } from '@/lib/utils'
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
  ensureFonts,
  downloadCanvas,
  captionBox,
  panScale,
  zoomLimits,
  type MapThemeCategory,
  type TextAlign,
  type OverlayEffect,
  type TextSize,
  type RenderOverlay,
  type RenderView,
  type RenderInput,
} from '@/features/studio/render'
import {
  createExport,
  exportErrorMessage,
  getZoneExports,
  isActive,
  type ExportJob,
} from '@/features/exports/api'
import {
  ExportBar,
  ExportPill,
  FORMAT_LABEL,
  detailFor,
  useExport,
} from '@/features/exports/components/ExportProgress'
import type { Zone } from '@/features/zones/types'

/** Playback speeds, as milliseconds between frames. */
const SPEEDS = [
  { label: '0.5×', ms: 2000 },
  { label: '1×', ms: 1000 },
  { label: '2×', ms: 500 },
  { label: '4×', ms: 250 },
]

/** Row one of the alignment control: the side the caption sits on, and its lines' edge. */
const H_ALIGN: { align: TextAlign; x: number; label: string; Icon: typeof IconAlignLeft }[] = [
  { align: 'left', x: 0.05, label: 'Align left', Icon: IconAlignLeft },
  { align: 'center', x: 0.5, label: 'Align center', Icon: IconAlignCenter },
  { align: 'right', x: 0.95, label: 'Align right', Icon: IconAlignRight },
]

/** Row two: where the caption sits vertically. */
const V_ALIGN: { y: number; label: string; Icon: typeof IconAlignTop }[] = [
  { y: 0.16, label: 'Align top', Icon: IconAlignTop },
  { y: 0.5, label: 'Align middle', Icon: IconAlignMiddle },
  { y: 0.84, label: 'Align bottom', Icon: IconAlignBottom },
]

const EFFECTS: { value: OverlayEffect; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'vignette', label: 'Vignette' },
]

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
]

const DEFAULT_OVERLAY: RenderOverlay = {
  effect: 'vignette',
  title: '',
  textSize: 'medium',
  text: { x: 0.95, y: 0.84, align: 'right' },
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
      // "Open in Studio" on a zone page arrives with ?zone=<id>. Read here rather than
      // with useSearchParams, which would need a Suspense boundary around the page.
      const wanted = new URLSearchParams(window.location.search).get('zone')
      const pick = next.find((z) => z.id === wanted) ?? next[0]
      if (pick) setZoneId((z) => z || pick.id)
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
      setCurrent(0)
      setPlaying(false)
    })
    return () => {
      cancelled = true
    }
  }, [zoneId])

  const allFrames = loadedFrames?.zoneId === zoneId ? loadedFrames.frames : null

  const days = useMemo(() => (allFrames ? studioApi.daysWithFrames(allFrames) : []), [allFrames])
  const ordered = useMemo(() => allFrames ?? [], [allFrames])
  const framesOn = useCallback((d: string) => ordered.filter((f) => studioApi.wibDate(f.capturedAt) === d), [ordered])

  /**
   * The playback/export range: two capture ids anywhere in the zone's history, so a
   * range can run across days — an evening into the next morning, or a whole week.
   * Bounded by real captures rather than clock times: captures land at irregular
   * moments, so every choice in the picker is a frame that actually exists.
   *
   * Keyed on the zone rather than reset by an effect — a range whose `zoneId` no longer
   * matches is simply not this zone's, and the read below falls back to the default on
   * its own (the same pattern `loadedFrames` uses). The default is the newest day: a
   * zone with weeks of history would otherwise open on a range of hundreds of frames.
   */
  const [range, setRange] = useState<{ zoneId: string; startId: string; endId: string } | null>(null)

  const newestDay = days[0] ?? ''
  const defaultRange = useMemo(() => {
    const newest = framesOn(newestDay)
    return { startId: newest[0]?.id ?? null, endId: newest[newest.length - 1]?.id ?? null }
  }, [framesOn, newestDay])

  const rangeStartId = range?.zoneId === zoneId ? range.startId : defaultRange.startId
  const rangeEndId = range?.zoneId === zoneId ? range.endId : defaultRange.endId
  const rangeStartIdx = Math.max(
    ordered.findIndex((f) => f.id === rangeStartId),
    0,
  )
  const rangeEndIdxFound = ordered.findIndex((f) => f.id === rangeEndId)
  const rangeEndIdx = rangeEndIdxFound === -1 ? ordered.length - 1 : rangeEndIdxFound

  /**
   * Moves one end of the range. Keeps it the right way round: pushing the start past
   * the end drags the end along (and vice versa) rather than producing an empty range.
   */
  function setRangeEnd(which: 'start' | 'end', id: string) {
    const idx = ordered.findIndex((f) => f.id === id)
    if (idx === -1) return
    let startId = ordered[rangeStartIdx]?.id ?? id
    let endId = ordered[rangeEndIdx]?.id ?? id
    if (which === 'start') {
      startId = id
      if (idx > rangeEndIdx) endId = id
    } else {
      endId = id
      if (idx < rangeStartIdx) startId = id
    }
    setRange({ zoneId, startId, endId })
    setPlaying(false)
  }
  function setRangeDay(which: 'start' | 'end', d: string) {
    const onDay = framesOn(d)
    // A day picked for the start begins at its first capture; for the end, its last.
    const pick = which === 'start' ? onDay[0] : onDay[onDay.length - 1]
    if (pick) setRangeEnd(which, pick.id)
  }
  function setWholeRange(startId: string | undefined, endId: string | undefined) {
    if (!startId || !endId) return
    setRange({ zoneId, startId, endId })
    setPlaying(false)
  }

  const startFrame = ordered[rangeStartIdx] ?? null
  const endFrame = ordered[rangeEndIdx] ?? null
  const startDay = startFrame ? studioApi.wibDate(startFrame.capturedAt) : ''
  const endDay = endFrame ? studioApi.wibDate(endFrame.capturedAt) : ''

  /**
   * What actually plays and exports. Every export (single PNG, image set, animation)
   * reads from this and nothing else, so the range the person set is exactly what they
   * get — no separate "export scope" that could disagree with the picker.
   */
  const frames = useMemo(() => ordered.slice(rangeStartIdx, rangeEndIdx + 1), [ordered, rangeStartIdx, rangeEndIdx])

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

  const previewCanvas = useRef<HTMLCanvasElement | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

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

  const [sizesOpen, setSizesOpen] = useState(false)

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
  // Canvas text doesn't wait for web fonts — it silently falls back. The caption's
  // fonts are awaited once, then the layer redraws in the right typeface; after that
  // every redraw is synchronous, so dragging the caption stays instant.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    void ensureFonts().then(() => {
      if (!cancelled) setFontsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    const canvas = overlayCanvas.current
    if (!canvas || !frame) return
    const dims = previewDims(outputSize)
    renderOverlays(canvas, renderInputFor(frame, null, dims.width, dims.height))
  }, [frame, renderInputFor, outputSize, fontsReady])

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
    | { kind: 'text'; x: number; y: number; textX: number; textY: number }
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
      // Start from where the caption is actually drawn — after clamping to the edge
      // margin — measured at the edge its alignment anchors to, so a caption parked
      // against an edge moves the moment it's dragged.
      const { align } = overlay.text
      const anchorX = align === 'left' ? box.x : align === 'center' ? box.x + box.width / 2 : box.x + box.width
      dragRef.current = {
        kind: 'text',
        x: e.clientX,
        y: e.clientY,
        textX: anchorX / input.width,
        textY: (box.y + box.height / 2) / input.height,
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
      // Moves the caption, never its alignment — that's the user's choice in the
      // alignment control, not something to infer from which side it was dropped on.
      const x = clamp(drag.textX + dx, 0, 1)
      const y = clamp(drag.textY + dy, 0, 1)
      setOverlay((o) => ({ ...o, text: { ...o.text, x, y } }))
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
      await downloadCanvas(canvas, `${zoneLabel}-${studioApi.wibStamp(frame.capturedAt)}.png`.replace(/[/\\:*?"<>|]/g, '-'))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export the image.')
    } finally {
      setExporting(null)
    }
  }, [frame, renderInputFor, trafficFor, zoneLabel, outputSize])

  /**
   * ZIP and animation exports run on the server (FE-21): the worker renders them with
   * this same renderer, so a long range no longer ties up — or dies with — this tab.
   * The request carries exactly what the preview shows: the range as its first and last
   * capture, and the style by id.
   */
  const [serverExport, setServerExport] = useState<{ zoneId: string; id: string; initial: ExportJob | null } | null>(null)
  const [exportDialog, setExportDialog] = useState<'closed' | 'choose' | 'progress'>('closed')
  const [starting, setStarting] = useState(false)
  const activeExportId = serverExport?.zoneId === zoneId ? serverExport.id : null
  const activeExport = useExport(activeExportId, serverExport?.zoneId === zoneId ? serverExport.initial : null)

  // An export already running for this zone — started earlier, or in another tab —
  // shows in the footer as soon as the zone opens, rather than only on the zone page.
  useEffect(() => {
    if (!zoneId) return
    let cancelled = false
    getZoneExports(zoneId)
      .then((rows) => {
        const running = rows.find(isActive)
        if (!cancelled && running) setServerExport({ zoneId, id: running.id, initial: running })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [zoneId])

  const startServerExport = useCallback(
    async (format: 'zip' | 'webm') => {
      if (!startFrame || !endFrame) return
      setExportError(null)
      setPlaying(false)
      setStarting(true)
      try {
        const job = await createExport(zoneId, {
          format,
          startCaptureId: startFrame.id,
          endCaptureId: endFrame.id,
          spec: {
            themeId,
            congestionId,
            overlay,
            view,
            width: outputSize.width,
            height: outputSize.height,
            holdMs: SPEEDS[speed]!.ms,
          },
        })
        setServerExport({ zoneId, id: job.id, initial: job })
        setExportDialog('progress')
      } catch (err) {
        setExportError(exportErrorMessage(err))
      } finally {
        setStarting(false)
      }
    },
    [startFrame, endFrame, zoneId, themeId, congestionId, overlay, view, outputSize, speed],
  )

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
        </div>
        <div className="flex flex-wrap gap-md">
          <Select
            value={zoneId}
            onValueChange={setZoneId}
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            className="w-56"
            aria-label="Zone"
          />
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

                {/* Where playback is. The date matters now that a range can span days. */}
                <span className="flex-1 min-w-0 text-center text-caption font-semibold tabular-nums text-text-secondary truncate">
                  Frame {current + 1} of {frames.length}
                  {frame && (
                    <>
                      <span aria-hidden className="text-text-muted"> · </span>
                      {formatDay(studioApi.wibDate(frame.capturedAt))}
                      <span aria-hidden className="text-text-muted"> · </span>
                      {frame.time} WIB
                    </>
                  )}
                </span>

                <div className="flex gap-xs">
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
              </div>
            </Card>
          </div>

          {/* The tools: one card, its sections divided by rules. On laptop+ it's a drawer —
              the map column stays put while the sections scroll (no scrollbar drawn), and
              Export is a fixed footer, reachable without scrolling past every control. */}
          <div className="flex flex-col min-w-0 bg-card border border-border rounded-lg overflow-hidden laptop:sticky laptop:top-lg laptop:max-h-[calc(100vh-2rem)]">
            <div className="px-lg laptop:flex-1 laptop:min-h-0 laptop:overflow-y-auto scrollbar-none">
            {/*
              What plays and what exports are the same set — narrowing this narrows both,
              so scrubbing or pressing Play IS the preview of what an export will contain.
              A separate "preview" surface would risk showing something export does not
              actually produce.
            */}
            <section className="space-y-md py-lg border-t border-divider first:border-t-0">
              <div className="flex items-center justify-between gap-sm">
                <SectionLabel>Timeframe</SectionLabel>
                <span className="text-micro font-semibold tabular-nums text-text-secondary bg-canvas-secondary rounded-xs px-sm py-xs">
                  {frames.length} frame{frames.length === 1 ? '' : 's'}
                </span>
              </div>
              {/* Quick picks, then the exact ends. Each end is a day and a capture on it,
                  so a range can start one evening and finish days later. */}
              <div className="flex gap-xs">
                {(
                  [
                    ['Newest day', defaultRange.startId, defaultRange.endId],
                    ['Last 7 days', framesOn(days[Math.min(6, days.length - 1)] ?? '')[0]?.id, ordered[ordered.length - 1]?.id],
                    ['All', ordered[0]?.id, ordered[ordered.length - 1]?.id],
                  ] as const
                ).map(([label, startId, endId]) => {
                  const active = startId === startFrame?.id && endId === endFrame?.id
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setWholeRange(startId ?? undefined, endId ?? undefined)}
                      aria-pressed={active}
                      className={cn(
                        'flex-1 h-8 rounded-md text-micro font-semibold transition-colors',
                        active ? 'bg-primary text-on-primary' : 'bg-canvas-secondary text-text-secondary hover:text-text-primary',
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {(
                [
                  ['start', 'From', startDay, startFrame],
                  ['end', 'To', endDay, endFrame],
                ] as const
              ).map(([which, label, d, f]) => (
                <div key={which} className="space-y-xs">
                  <p className="text-micro font-semibold uppercase tracking-wider text-text-muted">{label}</p>
                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-sm">
                    <Select
                      className="w-full"
                      value={d}
                      onValueChange={(next) => setRangeDay(which, next)}
                      options={days.map((day) => ({ value: day, label: formatDay(day) }))}
                      aria-label={`${label} day`}
                    />
                    <Select
                      className="w-full"
                      value={f?.id ?? ''}
                      onValueChange={(id) => setRangeEnd(which, id)}
                      options={framesOn(d).map((x) => ({ value: x.id, label: x.time }))}
                      aria-label={`${label} time`}
                    />
                  </div>
                </div>
              ))}
            </section>

            {/* 1. Map theme — the basemap's colour identity: a literal Standard rendering,
                or an Artistic mood. Traffic colours are untouched here on purpose. */}
            <section className="space-y-md py-lg border-t border-divider first:border-t-0">
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
            </section>

            {/* 2. Congestion theme — a separate, opt-in recolour of BR-017's four bands.
                Standard is the identity map: choosing it is choosing to keep the meaning. */}
            <section className="space-y-md py-lg border-t border-divider first:border-t-0">
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
            </section>

            {/* 3. Zoom & position — how far in, and where, the framing sits. The map
                itself also takes a drag (pan) and the mouse wheel (zoom). */}
            <section className="space-y-md py-lg border-t border-divider first:border-t-0">
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
            </section>

            {/* 4. Overlay — the caption (its words, size and place), the legend and the
                zone outline. */}
            <section className="space-y-md py-lg border-t border-divider first:border-t-0">
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
                <p className="text-micro font-semibold uppercase tracking-wider text-text-muted">Alignment</p>
                {/* Row one sets the side AND how the lines align; row two the height. A
                    drag moves the caption but leaves this choice alone. */}
                <div className="grid grid-cols-3 gap-sm">
                  {H_ALIGN.map(({ align, x, label, Icon }) => (
                    <AlignButton
                      key={align}
                      label={label}
                      active={overlay.text.align === align}
                      onSelect={() => setOverlay((o) => ({ ...o, text: { ...o.text, x, align } }))}
                    >
                      <Icon size={20} />
                    </AlignButton>
                  ))}
                  {V_ALIGN.map(({ y, label, Icon }) => (
                    <AlignButton
                      key={label}
                      label={label}
                      active={overlay.text.y === y}
                      onSelect={() => setOverlay((o) => ({ ...o, text: { ...o.text, y } }))}
                    >
                      <Icon size={20} />
                    </AlignButton>
                  ))}
                </div>
                <p className="flex items-center justify-center gap-xs text-caption text-text-muted">
                  <IconMove size={14} />
                  Drag the text on the preview to place it anywhere.
                </p>
              </div>
              <div className="space-y-xs">
                <p className="text-micro font-semibold uppercase tracking-wider text-text-muted">Effect</p>
                <Segmented
                  ariaLabel="Overlay effect"
                  value={overlay.effect}
                  onChange={(effect) => setOverlay((o) => ({ ...o, effect }))}
                  options={EFFECTS}
                />
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
            </section>

            {/* 5. Output size — the three poster shapes as cards, the rest behind "Other",
                and the exact pixels, editable, underneath. */}
            <section className="space-y-md py-lg border-t border-divider first:border-t-0">
              <SectionLabel>Output size</SectionLabel>
              <SizesDialog
                open={sizesOpen}
                selectedId={outputSizeId}
                onClose={() => setSizesOpen(false)}
                onPick={(id) => {
                  setOutputSizeId(id)
                  setSizesOpen(false)
                }}
              />
              <div className="grid grid-cols-2 gap-sm">
                {OUTPUT_SIZES.filter((o) => o.group === 'main').map((o) => (
                  <SizeCard
                    key={o.id}
                    title={o.name}
                    detail={`${o.width} × ${o.height}`}
                    active={outputSizeId === o.id}
                    onSelect={() => setOutputSizeId(o.id)}
                    shape={o}
                  />
                ))}
                <SizeCard
                  title="Other"
                  detail={otherActive ? (otherSize ? `${otherSize.width} × ${otherSize.height}` : 'Custom') : 'More sizes'}
                  active={otherActive}
                  onSelect={() => setSizesOpen(true)}
                  shape="many"
                />
              </div>
              {/* The exact pixels. Typing here makes the size custom. */}
              <div className="flex items-center gap-sm rounded-lg border border-dashed border-border bg-canvas-secondary/60 p-sm">
                <label className="flex items-center gap-xs flex-1 min-w-0 rounded-md bg-canvas border border-border px-sm h-10 focus-within:border-primary transition-colors">
                  <span className="text-micro font-semibold text-text-muted">W</span>
                  <BaseInput
                    type="number"
                    aria-label="Width in pixels"
                    min={MIN_OUTPUT_PX}
                    max={MAX_OUTPUT_PX}
                    value={outputSizeId === 'custom' ? customWidth : outputSize.width}
                    onValueChange={(value) => setCustomSize(Number(value), outputSizeId === 'custom' ? customHeight : outputSize.height)}
                    className="w-full min-w-0 bg-transparent text-body font-semibold tabular-nums text-text-primary focus:outline-none"
                  />
                  <span className="text-micro text-text-muted">px</span>
                </label>
                <span aria-hidden className="text-text-muted">×</span>
                <label className="flex items-center gap-xs flex-1 min-w-0 rounded-md bg-canvas border border-border px-sm h-10 focus-within:border-primary transition-colors">
                  <span className="text-micro font-semibold text-text-muted">H</span>
                  <BaseInput
                    type="number"
                    aria-label="Height in pixels"
                    min={MIN_OUTPUT_PX}
                    max={MAX_OUTPUT_PX}
                    value={outputSizeId === 'custom' ? customHeight : outputSize.height}
                    onValueChange={(value) => setCustomSize(outputSizeId === 'custom' ? customWidth : outputSize.width, Number(value))}
                    className="w-full min-w-0 bg-transparent text-body font-semibold tabular-nums text-text-primary focus:outline-none"
                  />
                  <span className="text-micro text-text-muted">px</span>
                </label>
              </div>
            </section>
            </div>

            <div className="shrink-0 border-t border-divider p-lg space-y-sm">
              <Button
                className="w-full justify-center gap-sm"
                onClick={() => setExportDialog('choose')}
                disabled={exporting !== null || !frame}
              >
                <IconDownload size={16} />
                Export
              </Button>
              {/* The export being made on the server, kept in view after its dialog is
                  closed. Clicking it reopens the progress view. */}
              {activeExport && (
                <button
                  type="button"
                  onClick={() => setExportDialog('progress')}
                  className="w-full text-left rounded-md border border-border bg-canvas-secondary/60 px-md py-sm space-y-xs hover:border-primary transition-colors"
                >
                  <span className="flex items-center justify-between gap-sm">
                    <span className="text-caption font-semibold text-text-primary">{FORMAT_LABEL[activeExport.format]}</span>
                    <ExportPill job={activeExport} />
                  </span>
                  <ExportBar job={activeExport} />
                </button>
              )}
              {exporting && (
                <div className="pt-xs">
                  <ProgressBar value={exporting.done} max={exporting.total} />
                  <p className="text-micro text-text-muted mt-xs tabular-nums">
                    {exporting.label} — {exporting.done} / {exporting.total}
                  </p>
                </div>
              )}
              {exportError && <p className="text-caption text-danger-text">{exportError}</p>}
              <ExportDialog
                view={exportDialog}
                onClose={() => setExportDialog('closed')}
                starting={starting}
                job={activeExport}
                zoneHref={activeExport ? `/zones/${activeExport.zoneId}?export=${activeExport.id}#exports` : null}
                busy={activeExport ? isActive(activeExport) : false}
                items={[
                  {
                    label: 'This frame',
                    format: 'PNG',
                    detail: `${outputSize.width} × ${outputSize.height} image, downloads right away`,
                    onSelect: () => {
                      setExportDialog('closed')
                      void exportPng()
                    },
                  },
                  {
                    label: 'All frames',
                    format: 'ZIP',
                    detail: `${frames.length} image${frames.length === 1 ? '' : 's'} in the selected time range`,
                    onSelect: () => void startServerExport('zip'),
                    disabled: frames.length === 0,
                  },
                  {
                    label: 'Animation',
                    format: 'WebM',
                    detail:
                      frames.length < 2
                        ? 'Needs at least 2 frames in range'
                        : `${frames.length} frames at ${SPEEDS[speed]!.label} speed`,
                    onSelect: () => void startServerExport('webm'),
                    disabled: frames.length < 2,
                  },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
            value === o.value ? 'bg-primary text-on-primary shadow-elevation-2' : 'text-text-secondary hover:text-text-primary',
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
  shape,
}: {
  title: string
  detail: string
  active: boolean
  onSelect: () => void
  /** The size's proportions, drawn as a small outline — or `many` for "Other". */
  shape: { width: number; height: number } | 'many'
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-md rounded-lg border px-md py-sm text-left transition-colors',
        active
          ? 'bg-primary border-primary text-on-primary shadow-elevation-2'
          : 'bg-canvas border-border text-text-primary hover:border-primary hover:bg-primary-soft/30',
      )}
    >
      <ShapeGlyph shape={shape} />
      <span className="min-w-0">
        <span className="block text-label font-semibold truncate">{title}</span>
        <span className={cn('block text-caption tabular-nums truncate', active ? 'text-on-primary/80' : 'text-text-muted')}>
          {detail}
        </span>
      </span>
    </button>
  )
}

/**
 * A size's proportions at a glance: its rectangle, fitted in a 22px square. "Other"
 * gets two stacked outlines — more than one shape behind it.
 */
function ShapeGlyph({ shape }: { shape: { width: number; height: number } | 'many' }) {
  const box = 'shrink-0 grid place-items-center h-[22px] w-[22px]'
  if (shape === 'many') {
    return (
      <span aria-hidden className={cn(box, 'relative')}>
        <span className="absolute h-[14px] w-[18px] rounded-[3px] border-2 border-current opacity-50 -translate-x-[2px] -translate-y-[2px]" />
        <span className="absolute h-[14px] w-[18px] rounded-[3px] border-2 border-current translate-x-[2px] translate-y-[2px]" />
      </span>
    )
  }
  const long = Math.max(shape.width, shape.height)
  return (
    <span aria-hidden className={box}>
      <span
        className="block rounded-[3px] border-2 border-current"
        style={{ width: `${(shape.width / long) * 22}px`, height: `${(shape.height / long) * 22}px` }}
      />
    </span>
  )
}

interface ExportItem {
  label: string
  format: string
  detail: string
  onSelect: () => void
  disabled?: boolean
}

/**
 * The Export dialog, in two views.
 *
 * **Choose:** three option cards. A PNG downloads right away; ZIP and animation are
 * sent to the server.
 *
 * **Progress:** once a server export starts, the dialog does not close — it becomes the
 * export's live status, and says plainly that the work happens elsewhere: it can be
 * closed, Studio can be left, and the file will be waiting on the zone page. A toast
 * that vanished after three seconds would leave someone wondering where their file went.
 */
function ExportDialog({
  view,
  onClose,
  items,
  starting,
  job,
  zoneHref,
  busy,
}: {
  view: 'closed' | 'choose' | 'progress'
  onClose: () => void
  items: ExportItem[]
  starting: boolean
  job: ExportJob | null
  zoneHref: string | null
  /** An export is already queued or rendering — only one at a time. */
  busy: boolean
}) {
  const showProgress = view === 'progress' && job !== null
  return (
    <Dialog.Root open={view !== 'closed'} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[30rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3 space-y-lg">
          {showProgress ? (
            <>
              <div>
                <Dialog.Title className="text-section-title text-text-primary">
                  {job.status === 'done'
                    ? 'Your export is ready'
                    : job.status === 'failed'
                      ? 'The export failed'
                      : job.format === 'webm'
                        ? 'Making your animation'
                        : 'Collecting your frames'}
                </Dialog.Title>
                <Dialog.Description className="text-body text-text-secondary mt-xs tabular-nums">
                  {job.frameCount} frames · {job.width} × {job.height} · {job.format === 'webm' ? 'WebM' : 'ZIP of PNGs'}
                </Dialog.Description>
              </div>

              <div className="space-y-sm rounded-lg border border-border p-lg">
                <ExportPill job={job} />
                <ExportBar job={job} />
                <p className={cn('text-caption', job.status === 'failed' ? 'text-danger-text' : 'text-text-secondary')}>
                  {detailFor(job)}
                </p>
              </div>

              {isActive(job) && (
                <p className="text-caption text-text-muted">
                  This runs on our servers. You can close this, keep editing, or leave Studio — the file will wait for
                  you on the zone page for 7 days.
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-sm">
                {zoneHref && (
                  <Link href={zoneHref} className={buttonClass('secondary')}>
                    Open zone page →
                  </Link>
                )}
                {job.status === 'done' && job.downloadUrl ? (
                  <a href={job.downloadUrl} download className={buttonClass()}>
                    Download
                  </a>
                ) : (
                  <Dialog.Close className={buttonClass(isActive(job) ? 'primary' : 'secondary')}>
                    {isActive(job) ? 'Keep editing' : 'Close'}
                  </Dialog.Close>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <Dialog.Title className="text-section-title text-text-primary">Export</Dialog.Title>
                <Dialog.Description className="text-body text-text-secondary mt-xs">
                  Every option uses the style shown in the preview. Frames and animations are made on our servers, so
                  you can keep working while they render.
                </Dialog.Description>
              </div>
              <div className="space-y-sm">
                {items.map((item) => {
                  const blocked = item.format !== 'PNG' && busy
                  return (
                    <button
                      key={item.label}
                      type="button"
                      disabled={item.disabled || blocked || starting}
                      onClick={item.onSelect}
                      className={cn(
                        'flex items-center justify-between gap-md w-full text-left rounded-lg border border-border px-lg py-md transition-colors',
                        'hover:border-primary hover:bg-primary-soft/40 focus:outline-none focus-visible:outline-2 focus-visible:outline-primary',
                        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-body font-semibold text-text-primary">{item.label}</span>
                        <span className="block text-caption text-text-muted mt-xs">
                          {blocked ? 'Another export is still being made — one at a time' : item.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-micro font-semibold text-primary bg-primary-soft rounded-xs px-sm py-xs">
                        {item.format}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-end">
                <Dialog.Close className={buttonClass('secondary')}>{starting ? 'Starting…' : 'Cancel'}</Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** One cell of the alignment control. */
function AlignButton({
  label,
  active,
  onSelect,
  children,
}: {
  label: string
  active: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'grid place-items-center h-11 rounded-md border-2 transition-colors',
        active
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-transparent text-text-secondary hover:bg-canvas-secondary hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}

/** Every output size, grouped, in a dialog — opened from the "Other" card. */
function SizesDialog({
  open,
  selectedId,
  onClose,
  onPick,
}: {
  open: boolean
  selectedId: string
  onClose: () => void
  onPick: (id: string) => void
}) {
  const groups: { title: string; group: 'main' | 'more' }[] = [
    { title: 'Poster', group: 'main' },
    { title: 'More sizes', group: 'more' },
  ]
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[34rem] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3 space-y-lg">
          <div>
            <Dialog.Title className="text-section-title text-text-primary">Output size</Dialog.Title>
            <Dialog.Description className="text-body text-text-secondary mt-xs">
              Pick the image size for every export.
            </Dialog.Description>
          </div>
          {groups.map(({ title, group }) => (
            <div key={group} className="space-y-sm">
              <p className="text-micro font-semibold uppercase tracking-wider text-text-muted">{title}</p>
              <div className="grid grid-cols-2 tablet:grid-cols-3 gap-sm">
                {OUTPUT_SIZES.filter((o) => o.group === group).map((o) => (
                  <SizeCard
                    key={o.id}
                    title={o.name}
                    detail={`${o.width} × ${o.height}`}
                    active={selectedId === o.id}
                    onSelect={() => onPick(o.id)}
                    shape={o}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Dialog.Close className={buttonClass('secondary')}>Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Every card's heading, in one style, so the drawer reads as one set of controls. */
function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-label font-semibold text-text-primary', className)}>{children}</p>
}

