/**
 * Draws a capture onto a canvas — basemap, traffic, overlays — and exports it.
 *
 * Done by hand rather than by screenshotting the Leaflet map, for two reasons. A DOM
 * screenshot needs a library the project does not have, and Leaflet's own canvas is
 * tainted the moment anything without CORS headers touches it, which turns `toBlob`
 * into a security error at the last step. Drawing the tiles ourselves keeps the canvas
 * clean and makes every pixel something we chose.
 *
 * The same function backs the still image and the animation: an animation is this
 * renderer called once per frame into a stream. If a server-side renderer is added
 * later (BR-009/BR-018), it should drive this code on an internal page rather than
 * reimplementing the drawing, or the two will slowly stop looking alike.
 */

import type { SlimTraffic } from './api'

const TILE_SIZE = 256

export interface StylePreset {
  id: string
  name: string
  /** CSS filter applied to the basemap only — the traffic sits on top, untouched. */
  basemapFilter: string
  background: string
  /** Multiplies the road stroke width. */
  strokeScale: number
  overlayText: string
  overlaySub: string
}

/**
 * The looks on offer.
 *
 * OSM's tiles are a light street map; every dark variant here is that map put through a
 * filter, which is the same trick the live map already uses (`.maceut-map-dark`). Doing
 * it here too means the preview and the export cannot disagree about what "dark" means.
 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    // ORDER MATTERS, and getting it wrong is not obvious: `brightness` before `invert`
    // darkens the light basemap, and inverting a dark image makes it light again — which
    // produced a washed grey, the opposite of the intent. Invert first to flip the map
    // dark, then dim it.
    basemapFilter: 'invert(1) hue-rotate(180deg) brightness(0.45) contrast(1.25) saturate(0.35)',
    background: '#050505',
    strokeScale: 1,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.72)',
  },
  {
    id: 'carbon',
    name: 'Carbon',
    basemapFilter: 'invert(1) grayscale(1) brightness(0.4) contrast(1.4)',
    background: '#000000',
    strokeScale: 1.15,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.68)',
  },
  {
    id: 'slate',
    name: 'Slate',
    basemapFilter: 'invert(1) hue-rotate(180deg) brightness(0.62) contrast(1.05) saturate(0.55)',
    background: '#12141a',
    strokeScale: 1,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.7)',
  },
  {
    id: 'daylight',
    name: 'Daylight',
    basemapFilter: 'saturate(0.5) brightness(1.03)',
    background: '#f2f2f0',
    strokeScale: 1,
    overlayText: '#14171c',
    overlaySub: 'rgba(20,23,28,0.7)',
  },
  {
    id: 'plain',
    name: 'No basemap',
    basemapFilter: 'none',
    background: '#050505',
    strokeScale: 1.3,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.72)',
  },
]

export interface RenderLayers {
  basemap: boolean
  timestamp: boolean
  legend: boolean
  boundary: boolean
}

export interface RenderInput {
  traffic: SlimTraffic | null
  /** Zone ring as [lng, lat], drawn when `layers.boundary`. */
  ring?: [number, number][]
  capturedAt: string
  zoneName: string
  style: StylePreset
  layers: RenderLayers
  width: number
  height: number
}

// --- Web Mercator, the projection every slippy map uses ------------------------

function lngToWorldX(lng: number, scale: number): number {
  return ((lng + 180) / 360) * scale
}

function latToWorldY(lat: number, scale: number): number {
  const s = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
}

interface Viewport {
  zoom: number
  scale: number
  originX: number
  originY: number
}

/**
 * The zoom and offset that fit `bounds` into the canvas with a little padding.
 *
 * Zoom is a whole number because tiles only exist at whole zooms; the remainder is
 * absorbed by padding rather than by scaling tiles, which would blur them.
 */
function fitViewport(
  bounds: { west: number; south: number; east: number; north: number },
  width: number,
  height: number,
  padding = 0.06,
): Viewport {
  for (let zoom = 18; zoom >= 1; zoom--) {
    const scale = TILE_SIZE * 2 ** zoom
    const w = Math.abs(lngToWorldX(bounds.east, scale) - lngToWorldX(bounds.west, scale))
    const h = Math.abs(latToWorldY(bounds.south, scale) - latToWorldY(bounds.north, scale))
    if (w <= width * (1 - padding * 2) && h <= height * (1 - padding * 2)) {
      const centreX = (lngToWorldX(bounds.east, scale) + lngToWorldX(bounds.west, scale)) / 2
      const centreY = (latToWorldY(bounds.south, scale) + latToWorldY(bounds.north, scale)) / 2
      return { zoom, scale, originX: centreX - width / 2, originY: centreY - height / 2 }
    }
  }
  const scale = TILE_SIZE * 2
  return { zoom: 1, scale, originX: 0, originY: 0 }
}

function project(lng: number, lat: number, v: Viewport): [number, number] {
  return [lngToWorldX(lng, v.scale) - v.originX, latToWorldY(lat, v.scale) - v.originY]
}

function boundsOf(input: RenderInput): { west: number; south: number; east: number; north: number } {
  const points: [number, number][] = []
  if (input.ring) points.push(...input.ring)
  for (const f of input.traffic?.features ?? []) points.push(...f.c)

  if (points.length === 0) return { west: 106.7, south: -6.3, east: 106.9, north: -6.1 }

  const lngs = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return { west: Math.min(...lngs), south: Math.min(...lats), east: Math.max(...lngs), north: Math.max(...lats) }
}

// --- tiles ---------------------------------------------------------------------

const tileCache = new Map<string, HTMLImageElement>()

/**
 * Loads one tile, cached across frames.
 *
 * `crossOrigin = 'anonymous'` is not optional: without it the canvas is tainted and
 * `toBlob` throws a security error at the very end, after all the work is done. OSM
 * serves `Access-Control-Allow-Origin: *`, which is what makes this possible at all.
 *
 * A tile that fails to load resolves to null rather than rejecting — one missing square
 * should leave a gap, not abandon the render.
 */
function loadTile(url: string): Promise<HTMLImageElement | null> {
  const hit = tileCache.get(url)
  if (hit) return Promise.resolve(hit)

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      tileCache.set(url, img)
      resolve(img)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

const TILE_URL = process.env.NEXT_PUBLIC_OSM_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

async function drawBasemap(ctx: CanvasRenderingContext2D, v: Viewport, input: RenderInput) {
  const first = { x: Math.floor(v.originX / TILE_SIZE), y: Math.floor(v.originY / TILE_SIZE) }
  const last = {
    x: Math.floor((v.originX + input.width) / TILE_SIZE),
    y: Math.floor((v.originY + input.height) / TILE_SIZE),
  }
  const max = 2 ** v.zoom

  const jobs: Promise<void>[] = []
  for (let x = first.x; x <= last.x; x++) {
    for (let y = first.y; y <= last.y; y++) {
      if (y < 0 || y >= max) continue
      const wrapped = ((x % max) + max) % max
      const url = TILE_URL.replace('{z}', String(v.zoom)).replace('{x}', String(wrapped)).replace('{y}', String(y))
      const dx = x * TILE_SIZE - v.originX
      const dy = y * TILE_SIZE - v.originY
      jobs.push(
        loadTile(url).then((img) => {
          if (img) ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE)
        }),
      )
    }
  }
  await Promise.all(jobs)
}

// --- overlays ------------------------------------------------------------------

const DAY_ID = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU']

function wibParts(iso: string): { date: string; time: string; day: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(d)
  // 0 = Sunday from getUTCDay; the label list starts on Monday.
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  return { date, time, day: DAY_ID[(wib.getUTCDay() + 6) % 7]! }
}

function drawTimestamp(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const { date, time, day } = wibParts(input.capturedAt)
  const { style, width, height } = input
  const right = width - Math.round(width * 0.05)
  const baseline = Math.round(height * 0.52)
  const unit = Math.max(Math.round(height / 38), 10)

  ctx.textAlign = 'right'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = unit

  ctx.fillStyle = style.overlaySub
  ctx.font = `600 ${unit * 1.15}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillText(date, right, baseline - unit * 1.9)

  ctx.fillStyle = style.overlayText
  ctx.font = `700 ${unit * 3.4}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillText(time, right, baseline + unit * 1.1)

  ctx.fillStyle = style.overlaySub
  ctx.font = `600 ${unit * 1.05}px ui-sans-serif, system-ui, sans-serif`
  // Letter-spacing has no canvas equivalent everywhere, so it is spelled into the string.
  ctx.fillText(day.split('').join(' '), right, baseline + unit * 2.9)

  ctx.shadowBlur = 0
  ctx.textAlign = 'left'
}

const LEGEND = [
  { label: 'Normal', color: '#4CAF50' },
  { label: 'Slow', color: '#F4A300' },
  { label: 'Heavy', color: '#EF7B21' },
  { label: 'Congested', color: '#EF4444' },
]

function drawLegend(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const unit = Math.max(Math.round(input.height / 46), 9)
  const x = Math.round(input.width * 0.04)
  let y = input.height - Math.round(input.height * 0.05)

  ctx.textAlign = 'left'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = unit * 0.8

  for (const band of [...LEGEND].reverse()) {
    ctx.strokeStyle = band.color
    ctx.lineWidth = Math.max(unit * 0.32, 3)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + unit * 2.2, y)
    ctx.stroke()

    ctx.fillStyle = input.style.overlaySub
    ctx.font = `600 ${unit}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(band.label, x + unit * 3, y + unit * 0.36)
    y -= unit * 1.9
  }
  ctx.shadowBlur = 0
}

function drawZoneName(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const unit = Math.max(Math.round(input.height / 40), 10)
  ctx.textAlign = 'left'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = unit
  ctx.fillStyle = input.style.overlayText
  ctx.font = `700 ${unit * 1.35}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillText(input.zoneName, Math.round(input.width * 0.04), Math.round(input.height * 0.09))
  ctx.shadowBlur = 0
}

// --- the render ----------------------------------------------------------------

/** Draws one capture. Awaits its tiles, so the canvas is complete when this resolves. */
export async function renderCapture(canvas: HTMLCanvasElement, input: RenderInput): Promise<void> {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = input.width
  canvas.height = input.height

  ctx.fillStyle = input.style.background
  ctx.fillRect(0, 0, input.width, input.height)

  const v = fitViewport(boundsOf(input), input.width, input.height)

  if (input.layers.basemap && input.style.basemapFilter !== 'none') {
    ctx.save()
    // The filter is on the basemap alone. Applying it globally would push the traffic
    // colours through it too, and a "congested" red that has been hue-rotated is no
    // longer the red the legend promises.
    ctx.filter = input.style.basemapFilter
    await drawBasemap(ctx, v, input)
    ctx.restore()
  } else if (input.layers.basemap) {
    await drawBasemap(ctx, v, input)
  }

  if (input.layers.boundary && input.ring && input.ring.length >= 3) {
    ctx.save()
    ctx.beginPath()
    input.ring.forEach(([lng, lat], i) => {
      const [x, y] = project(lng, lat, v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = 'rgba(90,53,243,0.12)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(126,99,255,0.85)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }

  // Traffic last among the map layers, so a road is never hidden by the boundary fill.
  const weight = Math.max((input.height / 300) * input.style.strokeScale, 1.5)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const feature of input.traffic?.features ?? []) {
    if (feature.c.length < 2) continue
    ctx.beginPath()
    feature.c.forEach(([lng, lat], i) => {
      const [x, y] = project(lng, lat, v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = feature.k
    ctx.lineWidth = weight
    ctx.stroke()
  }

  drawZoneName(ctx, input)
  if (input.layers.timestamp) drawTimestamp(ctx, input)
  if (input.layers.legend) drawLegend(ctx, input)
}

/** Saves a canvas as a PNG the browser downloads. */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas could not be exported — a tile may have blocked cross-origin reads.'))
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      resolve()
    }, 'image/png')
  })
}

/** The best container this browser will record. Null when it records none. */
export function preferredVideoType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const type of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

export interface AnimationOptions {
  canvas: HTMLCanvasElement
  /** Called to paint frame `i`; must resolve once the canvas is complete. */
  paint: (index: number) => Promise<void>
  frameCount: number
  /** How long each frame is held, in milliseconds. */
  holdMs: number
  onProgress?: (done: number, total: number) => void
}

/**
 * Records the canvas frame by frame into a WebM file.
 *
 * `captureStream(0)` plus `requestFrame()` gives manual control: the recorder takes a
 * frame only when told, so a slow tile fetch stretches nothing and a fast one does not
 * produce a blur of near-identical frames. Recording in real time would make the output
 * depend on the network, which is not a property anyone wants in an export.
 *
 * WebM because it is what browsers record without a library. MP4 needs an encoder, and
 * that is the same dependency question as server-side rendering.
 */
export async function recordAnimation(options: AnimationOptions): Promise<Blob> {
  const mimeType = preferredVideoType()
  if (!mimeType) throw new Error('This browser cannot record video.')

  const stream = options.canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as (CanvasCaptureMediaStreamTrack & MediaStreamTrack) | undefined
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })

  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  recorder.start()
  for (let i = 0; i < options.frameCount; i++) {
    await options.paint(i)
    track?.requestFrame()
    options.onProgress?.(i + 1, options.frameCount)
    // Hold the frame on screen for its share of the timeline.
    await new Promise((r) => setTimeout(r, options.holdMs))
  }
  recorder.stop()
  return finished
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
