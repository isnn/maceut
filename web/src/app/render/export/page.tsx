'use client'

/**
 * The export renderer the worker drives (FE-21). Not a page anyone visits.
 *
 * The worker opens this in headless Chromium, calls `window.__maceutExport(job)`, and
 * answers the page's requests through functions it exposes: `__exportFrame` (one
 * capture's traffic), `__exportProgress` (and whether to continue) and `__exportPng`
 * (each frame). The page holds no data of its own and calls no API, so
 * it needs no session and sits outside the app's signed-in area; opened by a person it
 * does nothing.
 *
 * It renders with the exact `renderCapture` Studio's preview uses —
 * that is the point: the exported file is the preview, not a second implementation of it.
 */

import { useEffect } from 'react'
import {
  CONGESTION_THEMES,
  MAP_THEMES,
  canvasToPngBlob,
  ensureFonts,
  renderCapture,
  type RenderInput,
  type RenderOverlay,
  type RenderView,
} from '@/features/studio/render'
import { wibStamp, type SlimTraffic } from '@/features/studio/api'

interface ExportJob {
  /**
   * `png` is one capture's image (CAP-02); `zip` is a run of export frames. Videos are
   * these same frames, encoded by ffmpeg in the worker (EXP-B) — nothing records here.
   */
  format: 'png' | 'zip'
  spec: {
    themeId: string
    congestionId: string
    overlay: RenderOverlay
    view: RenderView
    width: number
    height: number
    holdMs: number
    /** ZIP frame encoding (EXP-C): PNG is exact, WebP q90 is 4–8× smaller. */
    imageFormat?: 'png' | 'webp'
  }
  frameCount: number
  /** Resume point after a browser crash: frames before it are already in the file. */
  startFrame?: number
  /** Stop before this frame — the worker reuses already-rendered frames past it. */
  endFrame?: number
  zoneName: string
  ring: [number, number][]
}

/** Per-frame timings the worker logs, to see where an export's time goes. */
interface FrameStats {
  drawMs: number
  encodeMs: number
}

interface ExportFrame {
  capturedAt: string
  traffic: SlimTraffic | null
}

interface ExportBridge {
  __maceutExport?: (job: ExportJob) => Promise<void>
  __exportFrame: (i: number) => Promise<ExportFrame>
  __exportProgress: (done: number) => Promise<boolean>
  __exportPng: (i: number, name: string, base64: string, stats?: FrameStats) => Promise<void>
}

/** A blob as base64, without the data-URL prefix — how bytes cross to the worker. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** A canvas as an image of any type the browser can encode. */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Canvas could not be encoded as ${type}.`))), type, quality),
  )
}

/** The capture thumbnail's width; 2× the dashboard tile, so it stays sharp on retina. */
const THUMB_WIDTH = 320

/** A downscaled JPEG of `source`, keeping its aspect ratio. */
function thumbnailBlob(source: HTMLCanvasElement, width: number): Promise<Blob> {
  const thumb = document.createElement('canvas')
  thumb.width = width
  thumb.height = Math.round((source.height / source.width) * width)
  const ctx = thumb.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, thumb.width, thumb.height)
  return new Promise((resolve, reject) =>
    thumb.toBlob((b) => (b ? resolve(b) : reject(new Error('Thumbnail could not be encoded.'))), 'image/jpeg', 0.8),
  )
}

async function runExport(job: ExportJob): Promise<void> {
  const bridge = window as unknown as ExportBridge
  const theme = MAP_THEMES.find((t) => t.id === job.spec.themeId) ?? MAP_THEMES[0]!
  const congestion = CONGESTION_THEMES.find((c) => c.id === job.spec.congestionId) ?? CONGESTION_THEMES[0]!
  await ensureFonts()

  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)

  const inputFor = (frame: ExportFrame): RenderInput => ({
    traffic: frame.traffic,
    ring: job.ring,
    capturedAt: frame.capturedAt,
    zoneName: job.zoneName,
    theme,
    congestion,
    overlay: job.spec.overlay,
    view: job.spec.view,
    width: job.spec.width,
    height: job.spec.height,
  })

  const end = Math.min(job.endFrame ?? job.frameCount, job.frameCount)
  for (let i = job.startFrame ?? 0; i < end; i++) {
    const frame = await bridge.__exportFrame(i)
    const t0 = performance.now()
    await renderCapture(canvas, inputFor(frame))
    const t1 = performance.now()
    const webp = job.spec.imageFormat === 'webp'
    const png = webp ? await canvasToBlob(canvas, 'image/webp', 0.9) : await canvasToPngBlob(canvas)
    const t2 = performance.now()
    const name = `${String(i + 1).padStart(3, '0')}-${wibStamp(frame.capturedAt)}.${webp ? 'webp' : 'png'}`
    // Awaited: the worker writes this frame out before the next one is drawn, so
    // only one frame is ever in flight.
    await bridge.__exportPng(i, name, await toBase64(png), { drawMs: Math.round(t1 - t0), encodeMs: Math.round(t2 - t1) })
    if (!(await bridge.__exportProgress(i + 1))) return // cancelled
    // The worker launches Chromium with --expose-gc: free this frame's canvas copies,
    // blob and base64 string now, rather than whenever V8 gets round to it.
    ;(globalThis as { gc?: () => void }).gc?.()
  }
  // A capture image (CAP-02) also gets a small JPEG for lists like the dashboard's
  // "Latest captures" — ~20 KB instead of the ~1 MB full image, drawn from the same
  // canvas, so it costs no second render.
  if (job.format === 'png') {
    const thumb = await thumbnailBlob(canvas, THUMB_WIDTH)
    await bridge.__exportPng(1, 'thumb.jpg', await toBase64(thumb))
  }
}

export default function ExportRenderPage() {
  useEffect(() => {
    ;(window as unknown as ExportBridge).__maceutExport = runExport
  }, [])
  return <p className="p-xl text-body text-text-muted">Maceut export renderer.</p>
}
