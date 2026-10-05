'use client'

/**
 * The export renderer the worker drives (FE-21). Not a page anyone visits.
 *
 * The worker opens this in headless Chromium, calls `window.__maceutExport(job)`, and
 * answers the page's requests through functions it exposes: `__exportFrame` (one
 * capture's traffic), `__exportProgress` (and whether to continue), `__exportPng` /
 * `__exportChunk` (the output). The page holds no data of its own and calls no API, so
 * it needs no session and sits outside the app's signed-in area; opened by a person it
 * does nothing.
 *
 * It renders with the exact `renderCapture` / `recordAnimation` Studio's preview uses —
 * that is the point: the exported file is the preview, not a second implementation of it.
 */

import { useEffect } from 'react'
import {
  CONGESTION_THEMES,
  MAP_THEMES,
  canvasToPngBlob,
  ensureFonts,
  recordAnimation,
  renderCapture,
  type RenderInput,
  type RenderOverlay,
  type RenderView,
} from '@/features/studio/render'
import { wibStamp, type SlimTraffic } from '@/features/studio/api'

interface ExportJob {
  /** `png` is one capture's image (CAP-02) — frame 0, rendered the same way as a ZIP frame. */
  format: 'png' | 'zip' | 'webm'
  spec: {
    themeId: string
    congestionId: string
    overlay: RenderOverlay
    view: RenderView
    width: number
    height: number
    holdMs: number
  }
  frameCount: number
  zoneName: string
  ring: [number, number][]
}

interface ExportFrame {
  capturedAt: string
  traffic: SlimTraffic | null
}

interface ExportBridge {
  __maceutExport?: (job: ExportJob) => Promise<void>
  __exportFrame: (i: number) => Promise<ExportFrame>
  __exportProgress: (done: number) => Promise<boolean>
  __exportPng: (i: number, name: string, base64: string) => Promise<void>
  __exportChunk: (base64: string) => Promise<void>
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

/** Output is handed over in pieces: one huge base64 string would strain the bridge. */
const CHUNK_BYTES = 4 * 1024 * 1024

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

  if (job.format === 'png' || job.format === 'zip') {
    for (let i = 0; i < job.frameCount; i++) {
      const frame = await bridge.__exportFrame(i)
      await renderCapture(canvas, inputFor(frame))
      const png = await canvasToPngBlob(canvas)
      const name = `${String(i + 1).padStart(3, '0')}-${wibStamp(frame.capturedAt)}.png`
      await bridge.__exportPng(i, name, await toBase64(png))
      if (!(await bridge.__exportProgress(i + 1))) return // cancelled
    }
    return
  }

  let stop = false
  const video = await recordAnimation({
    canvas,
    frameCount: job.frameCount,
    holdMs: job.spec.holdMs,
    paint: async (i) => {
      if (stop) throw new Error('Dibatalkan.')
      await renderCapture(canvas, inputFor(await bridge.__exportFrame(i)))
    },
    onProgress: (done) => {
      void bridge.__exportProgress(done).then((go) => {
        if (!go) stop = true
      })
    },
  })
  for (let offset = 0; offset < video.size; offset += CHUNK_BYTES) {
    await bridge.__exportChunk(await toBase64(video.slice(offset, offset + CHUNK_BYTES)))
  }
}

export default function ExportRenderPage() {
  useEffect(() => {
    ;(window as unknown as ExportBridge).__maceutExport = runExport
  }, [])
  return <p className="p-xl text-body text-text-muted">Maceut export renderer.</p>
}
