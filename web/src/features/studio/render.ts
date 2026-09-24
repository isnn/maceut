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

// --- map themes ------------------------------------------------------------------

export type MapThemeCategory = 'standard' | 'artistic'
export type BasemapSource = 'osm' | 'satellite'

export interface MapTheme {
  id: string
  name: string
  category: MapThemeCategory
  basemap: BasemapSource
  /** CSS filter applied to the basemap tiles only — traffic and text sit above it. */
  basemapFilter: string
  /** Canvas ground colour, visible where no tile has loaded and behind transparent PNG edges. */
  background: string
  /** Multiplies the road stroke width — artistic looks read better with a bolder line. */
  strokeScale: number
  overlayText: string
  overlaySub: string
  /**
   * A colour wash over the finished composition — basemap, traffic and text alike —
   * blended in rather than applied as a filter. A CSS filter on the basemap alone
   * cannot touch the traffic lines without also breaking the "standard" congestion
   * colours (see CONGESTION_THEMES), so an artistic identity that wants to tint
   * everything has to be a glaze applied last, over the whole canvas.
   */
  wash?: { color: string; blend: GlobalCompositeOperation; opacity: number }
}

/**
 * Standard/Artistic mirrors the reference the brief named
 * (maptoposter.tarmizi.id's Map Style panel): standard themes are a literal
 * representation of the basemap and are safe defaults; artistic ones commit to a
 * mood. Every dark theme is OSM's own tiles run through a CSS filter — the same
 * `invert → hue-rotate → dim` trick the live app map already uses in
 * `.maceut-map-dark` — so "dark" means the same thing everywhere in the product.
 *
 * Order for the filter chain matters and is easy to get backwards: `invert` must
 * come before `brightness`/`contrast`, or a dark result gets re-lightened. That bug
 * shipped once already (see the SPRINT.md entry for 2026-09-23) and is exactly why
 * this comment exists.
 */
export const MAP_THEMES: MapTheme[] = [
  // --- standard ---
  {
    id: 'dark',
    name: 'Dark',
    category: 'standard',
    basemap: 'osm',
    basemapFilter: 'invert(1) hue-rotate(180deg) brightness(0.45) contrast(1.25) saturate(0.35)',
    background: '#050505',
    strokeScale: 1,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.72)',
  },
  {
    id: 'daylight',
    name: 'Daylight',
    category: 'standard',
    basemap: 'osm',
    basemapFilter: 'saturate(0.5) brightness(1.03)',
    background: '#f2f2f0',
    strokeScale: 1,
    overlayText: '#14171c',
    overlaySub: 'rgba(20,23,28,0.7)',
  },
  {
    id: 'satellite',
    name: 'Satellite',
    category: 'standard',
    basemap: 'satellite',
    // Imagery is already photographic; a light grade keeps it legible under text
    // and traffic rather than trying to force it into an invert-based palette that
    // was designed for a flat-coloured street map.
    basemapFilter: 'saturate(1.05) contrast(1.08) brightness(0.92)',
    background: '#0a0a0a',
    strokeScale: 1.1,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.8)',
  },

  // --- artistic ---
  {
    id: 'default',
    name: 'Default',
    category: 'artistic',
    basemap: 'osm',
    basemapFilter: 'invert(1) hue-rotate(180deg) brightness(0.45) contrast(1.25) saturate(0.35)',
    background: '#050505',
    strokeScale: 1.15,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.72)',
  },
  {
    id: 'cyber-glitch',
    name: 'Cyber Glitch',
    category: 'artistic',
    basemap: 'osm',
    basemapFilter: 'invert(1) hue-rotate(260deg) saturate(2.4) brightness(0.42) contrast(1.6)',
    background: '#050110',
    strokeScale: 1.25,
    overlayText: '#e6faff',
    overlaySub: 'rgba(140,255,255,0.85)',
    wash: { color: '#ff00e6', blend: 'color-dodge', opacity: 0.1 },
  },
  {
    id: 'midnight-neon',
    name: 'Midnight Neon',
    category: 'artistic',
    basemap: 'osm',
    basemapFilter: 'invert(1) hue-rotate(195deg) brightness(0.38) contrast(1.3) saturate(0.95)',
    background: '#020308',
    strokeScale: 1.2,
    overlayText: '#eaf1ff',
    overlaySub: 'rgba(160,190,255,0.82)',
    wash: { color: '#3b6bff', blend: 'screen', opacity: 0.12 },
  },
  {
    id: 'sakura-bloom',
    name: 'Sakura Bloom',
    category: 'artistic',
    basemap: 'osm',
    basemapFilter: 'invert(1) hue-rotate(305deg) saturate(0.65) brightness(0.58) contrast(1.15)',
    background: '#0c0509',
    strokeScale: 1.15,
    overlayText: '#ffe9f2',
    overlaySub: 'rgba(255,214,235,0.82)',
    wash: { color: '#ffb6d9', blend: 'soft-light', opacity: 0.28 },
  },
]

// --- congestion themes -------------------------------------------------------------

/**
 * BR-017's four bands, and the exact hex each one arrives from the server as — the
 * `k` field on every `SlimTraffic` feature is already one of these four colours,
 * chosen server-side from the jam factor. That is the whole reason a congestion
 * theme can be a client-only remap: there are only ever four input colours.
 */
const BR017_HEX = { normal: '#4CAF50', slow: '#F4A300', heavy: '#EF7B21', congested: '#EF4444' } as const

export interface CongestionTheme {
  id: string
  name: string
  /** Keyed by BR-017's hex, valued by what this theme draws it as. */
  map: Record<string, string>
  /** Labels for the legend, in BR-017's band order — the theme only recolours, never renames. */
  bands: { label: string; color: string }[]
}

function bandsFor(map: Record<string, string>): CongestionTheme['bands'] {
  return [
    { label: 'Normal', color: map[BR017_HEX.normal]! },
    { label: 'Slow', color: map[BR017_HEX.slow]! },
    { label: 'Heavy', color: map[BR017_HEX.heavy]! },
    { label: 'Congested', color: map[BR017_HEX.congested]! },
  ]
}

/**
 * "Standard" maps every colour to itself. That identity mapping is not a placeholder
 * — it is the point. BR-017's colours carry real meaning (green means clear, red
 * means congested), and a poster tool re-skinning them for mood must never do that
 * silently. Standard is what a map theme change alone gets you; every other option
 * here is a deliberate, separate choice to trade legibility for a look.
 */
export const CONGESTION_THEMES: CongestionTheme[] = [
  {
    id: 'standard',
    name: 'Standard (BR-017)',
    map: {
      [BR017_HEX.normal]: BR017_HEX.normal,
      [BR017_HEX.slow]: BR017_HEX.slow,
      [BR017_HEX.heavy]: BR017_HEX.heavy,
      [BR017_HEX.congested]: BR017_HEX.congested,
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    map: { [BR017_HEX.normal]: '#FFD166', [BR017_HEX.slow]: '#FB8B24', [BR017_HEX.heavy]: '#E85D04', [BR017_HEX.congested]: '#9D0208' },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    map: { [BR017_HEX.normal]: '#6b7280', [BR017_HEX.slow]: '#9ca3af', [BR017_HEX.heavy]: '#d1d5db', [BR017_HEX.congested]: '#ffffff' },
  },
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    map: { [BR017_HEX.normal]: '#00ffab', [BR017_HEX.slow]: '#ffe600', [BR017_HEX.heavy]: '#ff6a00', [BR017_HEX.congested]: '#ff005c' },
  },
].map((t) => ({ ...t, bands: bandsFor(t.map) }))

// --- output sizes --------------------------------------------------------------

export interface OutputSize {
  id: string
  name: string
  width: number
  height: number
}

/**
 * maptoposter.tarmizi.id's own preset shapes, plus the 1600×1000 size this renderer
 * shipped with first — kept as "Classic" rather than dropped, so an export made last
 * week and one made today can still match.
 */
export const OUTPUT_SIZES: OutputSize[] = [
  { id: 'square', name: 'Square · 1080×1080', width: 1080, height: 1080 },
  { id: 'portrait', name: 'Portrait · 1080×1920', width: 1080, height: 1920 },
  { id: 'landscape', name: 'Landscape · 1920×1080', width: 1920, height: 1080 },
  { id: 'classic', name: 'Classic · 1600×1000', width: 1600, height: 1000 },
]

export const MIN_OUTPUT_PX = 200
export const MAX_OUTPUT_PX = 4000

// --- overlay ---------------------------------------------------------------------

export type TextPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

export interface RenderOverlay {
  /** The zone name + date/time/day block, shown or hidden as one unit. */
  showText: boolean
  textPosition: TextPosition
  legend: boolean
  boundary: boolean
}

// --- view (zoom / pan) ------------------------------------------------------------

export interface RenderView {
  /**
   * Steps away from the framing that fits the traffic + boundary with padding.
   * Relative rather than an absolute zoom level: a zone the size of a district and
   * one the size of a neighbourhood need different absolute zooms to look "right",
   * but "one step closer than the automatic frame" means the same thing for both.
   */
  zoomOffset: number
  /**
   * Pan as a fraction of the canvas's own width/height, not pixels. Pixels would mean
   * a pan set while looking at the 960-wide preview lands somewhere else entirely on
   * a 1920-wide export — the one thing this renderer has held to since Studio's first
   * version is that the preview IS what exports. A fraction is resolution-independent
   * by construction.
   */
  panX: number
  panY: number
}

export const DEFAULT_VIEW: RenderView = { zoomOffset: 0, panX: 0, panY: 0 }

// --- the render input ------------------------------------------------------------

export interface RenderInput {
  traffic: SlimTraffic | null
  /** Zone ring as [lng, lat], drawn when `overlay.boundary`. */
  ring?: [number, number][]
  capturedAt: string
  zoneName: string
  theme: MapTheme
  showBasemap: boolean
  congestion: CongestionTheme
  overlay: RenderOverlay
  view: RenderView
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
 * The zoom that fits `bounds` into `width`×`height` with padding, before any manual
 * zoom offset is applied. Zoom is a whole number because tiles only exist at whole
 * zooms; the remainder is absorbed by padding rather than by scaling tiles, which
 * would blur them.
 */
function fitZoom(bounds: Bounds, width: number, height: number, padding: number): number {
  for (let zoom = 18; zoom >= 1; zoom--) {
    const scale = TILE_SIZE * 2 ** zoom
    const w = Math.abs(lngToWorldX(bounds.east, scale) - lngToWorldX(bounds.west, scale))
    const h = Math.abs(latToWorldY(bounds.south, scale) - latToWorldY(bounds.north, scale))
    if (w <= width * (1 - padding * 2) && h <= height * (1 - padding * 2)) return zoom
  }
  return 1
}

interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

/**
 * Builds the viewport: auto-fit zoom plus the manual offset, centred on the data,
 * then nudged by the fractional pan. Centring is computed independently of zoom so
 * that changing `zoomOffset` zooms toward the same geographic point rather than
 * toward the canvas's top-left corner, which is what re-using the old `origin`
 * across a zoom change would do.
 */
function computeViewport(bounds: Bounds, width: number, height: number, view: RenderView, padding = 0.06): Viewport {
  const base = fitZoom(bounds, width, height, padding)
  const zoom = Math.min(Math.max(base + view.zoomOffset, 1), 18)
  const scale = TILE_SIZE * 2 ** zoom

  const centreLng = (bounds.east + bounds.west) / 2
  const centreLat = (bounds.north + bounds.south) / 2
  const centreX = lngToWorldX(centreLng, scale)
  const centreY = latToWorldY(centreLat, scale)

  return {
    zoom,
    scale,
    originX: centreX - width / 2 - view.panX * width,
    originY: centreY - height / 2 - view.panY * height,
  }
}

function project(lng: number, lat: number, v: Viewport): [number, number] {
  return [lngToWorldX(lng, v.scale) - v.originX, latToWorldY(lat, v.scale) - v.originY]
}

function boundsOf(input: RenderInput): Bounds {
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
 * Loads one tile, cached across frames and across basemap sources (the cache key
 * includes the full URL, so switching themes never serves a stale image).
 *
 * `crossOrigin = 'anonymous'` is not optional: without it the canvas is tainted and
 * `toBlob` throws a security error at the very end, after all the work is done. Both
 * tile sources this renderer uses serve `Access-Control-Allow-Origin: *` — checked
 * before either was wired in, not assumed.
 *
 * A tile that fails to load resolves to null rather than rejecting — one missing
 * square should leave a gap, not abandon the render.
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

const OSM_TILE_URL = process.env.NEXT_PUBLIC_OSM_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
/**
 * Esri's free World Imagery basemap — no API key, `Access-Control-Allow-Origin: *`
 * confirmed directly before this was wired in. Its path order is `{z}/{y}/{x}`,
 * the reverse of OSM's `{z}/{x}/{y}`; getting that swapped silently draws the wrong
 * hemisphere's tiles rather than erroring, so it is worth stating plainly here.
 */
const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

function tileUrl(source: BasemapSource, z: number, x: number, y: number): string {
  const template = source === 'satellite' ? SATELLITE_TILE_URL : OSM_TILE_URL
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}

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
      const url = tileUrl(input.theme.basemap, v.zoom, wrapped, y)
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

/** Anchor point and text alignment for each of the five overlay positions. */
function textAnchor(position: TextPosition, width: number, height: number) {
  const margin = { x: Math.round(width * 0.05), y: Math.round(height * 0.08) }
  switch (position) {
    case 'top-left':
      return { x: margin.x, y: margin.y, align: 'left' as CanvasTextAlign, vAlign: 'top' as const }
    case 'top-right':
      return { x: width - margin.x, y: margin.y, align: 'right' as CanvasTextAlign, vAlign: 'top' as const }
    case 'bottom-left':
      return { x: margin.x, y: height - margin.y, align: 'left' as CanvasTextAlign, vAlign: 'bottom' as const }
    case 'center':
      return { x: width / 2, y: height / 2, align: 'center' as CanvasTextAlign, vAlign: 'middle' as const }
    case 'bottom-right':
    default:
      return { x: width - margin.x, y: height - margin.y, align: 'right' as CanvasTextAlign, vAlign: 'bottom' as const }
  }
}

/**
 * The zone name and date/time/day, as one repositionable block (BR-018's required
 * fields, drawn together because a poster tool's "caption" is conventionally one
 * unit — separating them into independently placed elements is more controls for a
 * combination nobody asks for).
 */
function drawText(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const { date, time, day } = wibParts(input.capturedAt)
  const { theme, width, height, overlay, zoneName } = input
  const unit = Math.max(Math.round(height / 34), 11)
  const lineGap = unit * 1.85
  const anchor = textAnchor(overlay.textPosition, width, height)

  // Five lines stacked: name, date, time (large), day. Vertical anchoring decides
  // whether that stack grows down from `anchor.y` (top positions), up from it
  // (bottom positions) or is centred on it.
  const lines = [
    { text: zoneName, size: unit * 1.3, weight: 700, color: theme.overlayText, gapAfter: lineGap * 1.15 },
    { text: date, size: unit * 1.05, weight: 600, color: theme.overlaySub, gapAfter: lineGap },
    { text: time, size: unit * 3.1, weight: 700, color: theme.overlayText, gapAfter: lineGap * 1.05 },
    { text: day.split('').join(' '), size: unit * 0.95, weight: 600, color: theme.overlaySub, gapAfter: 0 },
  ]
  const totalHeight = lines.reduce((sum, l) => sum + l.size * 1.15 + l.gapAfter, 0)

  let y =
    anchor.vAlign === 'top'
      ? anchor.y + lines[0]!.size
      : anchor.vAlign === 'bottom'
        ? anchor.y - totalHeight + lines[0]!.size
        : anchor.y - totalHeight / 2 + lines[0]!.size

  ctx.textAlign = anchor.align
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = unit

  for (const line of lines) {
    ctx.fillStyle = line.color
    ctx.font = `${line.weight} ${line.size}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(line.text, anchor.x, y)
    y += line.size * 1.15 + line.gapAfter
  }

  ctx.shadowBlur = 0
  ctx.textAlign = 'left'
}

function drawLegend(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const unit = Math.max(Math.round(input.height / 46), 9)
  const x = Math.round(input.width * 0.04)
  let y = input.height - Math.round(input.height * 0.05)

  ctx.textAlign = 'left'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = unit * 0.8

  for (const band of [...input.congestion.bands].reverse()) {
    ctx.strokeStyle = band.color
    ctx.lineWidth = Math.max(unit * 0.32, 3)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + unit * 2.2, y)
    ctx.stroke()

    ctx.fillStyle = input.theme.overlaySub
    ctx.font = `600 ${unit}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(band.label, x + unit * 3, y + unit * 0.36)
    y -= unit * 1.9
  }
  ctx.shadowBlur = 0
}

// --- the render ----------------------------------------------------------------

/** Draws one capture. Awaits its tiles, so the canvas is complete when this resolves. */
export async function renderCapture(canvas: HTMLCanvasElement, input: RenderInput): Promise<void> {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = input.width
  canvas.height = input.height

  ctx.fillStyle = input.theme.background
  ctx.fillRect(0, 0, input.width, input.height)

  const v = computeViewport(boundsOf(input), input.width, input.height, input.view)

  if (input.showBasemap) {
    if (input.theme.basemapFilter !== 'none') {
      ctx.save()
      // The filter sits on the basemap layer alone. Applying it to the whole canvas
      // would push the traffic colours through it too, and a congestion theme's
      // "congested" red run through a hue-rotate is no longer the red its own
      // legend promises.
      ctx.filter = input.theme.basemapFilter
      await drawBasemap(ctx, v, input)
      ctx.restore()
    } else {
      await drawBasemap(ctx, v, input)
    }
  }

  if (input.overlay.boundary && input.ring && input.ring.length >= 3) {
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
  const weight = Math.max((input.height / 300) * input.theme.strokeScale, 1.5)
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
    // Remapped through the active congestion theme. `feature.k` is always one of
    // BR-017's four hexes; an unrecognised value (there should be none) falls back
    // to itself rather than vanishing.
    ctx.strokeStyle = input.congestion.map[feature.k] ?? feature.k
    ctx.lineWidth = weight
    ctx.stroke()
  }

  if (input.overlay.showText) drawText(ctx, input)
  if (input.overlay.legend) drawLegend(ctx, input)

  // The theme's wash, if it has one — a colour glaze over EVERYTHING drawn so far,
  // basemap and traffic and text alike. Deliberately last: a filter earlier in the
  // pipeline can only touch what is drawn after it, and an artistic identity that
  // wants to unify the whole poster has to grade the whole poster, not just the map.
  if (input.theme.wash) {
    ctx.save()
    ctx.globalCompositeOperation = input.theme.wash.blend
    ctx.globalAlpha = input.theme.wash.opacity
    ctx.fillStyle = input.theme.wash.color
    ctx.fillRect(0, 0, input.width, input.height)
    ctx.restore()
  }
}

/**
 * The canvas as a PNG blob, or a rejected promise if export was blocked.
 *
 * Split out from `downloadCanvas` so the multi-image export can reuse it: bundling
 * several frames into one ZIP needs the bytes, not a triggered download for each.
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas could not be exported — a tile may have blocked cross-origin reads.'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

/** Saves a canvas as a PNG the browser downloads. */
export async function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await canvasToPngBlob(canvas)
  downloadBlob(blob, filename)
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
