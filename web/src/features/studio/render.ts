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
import { drawVectorBasemap, type VectorPalette } from './vector-tiles'

const TILE_SIZE = 256

// --- map themes ------------------------------------------------------------------

export type MapThemeCategory = 'standard' | 'artistic'
export type BasemapSource = 'vector' | 'satellite'

export interface MapTheme {
  id: string
  name: string
  category: MapThemeCategory
  basemap: BasemapSource
  /** The street map's colours — every vector theme is this palette and nothing else. */
  palette?: VectorPalette
  /** CSS filter over the satellite imagery. Raster only: vector themes are coloured by palette. */
  rasterFilter?: string
  /** Canvas ground, under the basemap and wherever a tile failed to load. */
  background: string
  /**
   * The line under each traffic road, 2px wider. MapToPoster draws its route line the
   * same way: over a map this dense, a coloured line needs an edge in the ground colour
   * or it dissolves into the streets around it.
   */
  casing: string
  /** Multiplies the traffic stroke width. */
  strokeScale: number
  overlayText: string
  overlaySub: string
  /** Four colours for the overlapping circles on the theme's picker card. */
  swatch: string[]
  /** One line describing the look, shown under the picker for the selected theme. */
  caption: string
}

type VectorThemeSpec = Omit<MapTheme, 'basemap' | 'swatch' | 'background'> & { palette: VectorPalette }

/** A vector theme's card swatch is its own palette: ground, motorway, primary, water. */
function vectorTheme(spec: VectorThemeSpec): MapTheme {
  const { palette } = spec
  return {
    ...spec,
    basemap: 'vector',
    background: palette.bg,
    swatch: [palette.bg, palette.roads.motorway, palette.roads.primary, palette.water],
  }
}

/**
 * Standard/Artistic mirrors maptoposter.tarmizi.id's Map Style panel, and so does the
 * way a theme is built: a palette over OpenStreetMap's vector roads, water and parks
 * (see vector-tiles.ts). Standard is the plain reading; Artistic commits to a mood.
 * Cyber Glitch's palette is adapted from MapToPoster's MIT-licensed `cyber_noir`
 * (github.com/dimartarmizi/map-to-poster).
 *
 * The previous generation of themes pushed OSM's raster tiles through CSS filter chains
 * (invert → hue-rotate → dim). That could darken a map but never recolour its roads by
 * class, and the small streets were lost in the process — which is exactly what this
 * replaced. Only Satellite, being a photograph, still uses a filter.
 */
export const MAP_THEMES: MapTheme[] = [
  // --- standard ---
  vectorTheme({
    id: 'dark',
    name: 'Dark',
    category: 'standard',
    palette: {
      bg: '#0d0e12',
      water: '#1a2230',
      parks: '#14181a',
      roads: {
        default: '#23252c',
        minor: '#2c2f37',
        tertiary: '#3a3d46',
        secondary: '#4a4e58',
        primary: '#62666f',
        motorway: '#7c808a',
      },
    },
    casing: '#0d0e12',
    strokeScale: 1,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.72)',
    caption: 'Every street at night, dimmed so the traffic leads.',
  }),
  vectorTheme({
    id: 'daylight',
    name: 'Daylight',
    category: 'standard',
    palette: {
      bg: '#f3f3f1',
      water: '#dde3e8',
      parks: '#e6e9e2',
      roads: {
        default: '#cfd0d3',
        minor: '#bcbdc1',
        tertiary: '#909297',
        secondary: '#6e7075',
        primary: '#4d4f55',
        motorway: '#2f3136',
      },
    },
    casing: '#f3f3f1',
    strokeScale: 1,
    overlayText: '#14171c',
    overlaySub: 'rgba(20,23,28,0.7)',
    caption: 'Ink-grey streets on pale paper — the classic city print.',
  }),
  {
    id: 'satellite',
    name: 'Satellite',
    category: 'standard',
    basemap: 'satellite',
    // Imagery is already photographic; a light grade keeps it legible under text
    // and traffic rather than forcing it into a palette.
    rasterFilter: 'saturate(1.05) contrast(1.08) brightness(0.92)',
    background: '#0a0a0a',
    casing: 'rgba(0,0,0,0.6)',
    strokeScale: 1.1,
    overlayText: '#ffffff',
    overlaySub: 'rgba(255,255,255,0.8)',
    swatch: ['#2e3b26', '#56613f', '#8a7a58', '#3f5b73'],
    caption: 'Real imagery from above, with traffic drawn over the rooftops.',
  },

  // --- artistic ---
  vectorTheme({
    id: 'default',
    name: 'Default',
    category: 'artistic',
    palette: {
      bg: '#16161a',
      water: '#22262c',
      parks: '#1b1d1f',
      roads: {
        default: '#34322e',
        minor: '#47443e',
        tertiary: '#7a756a',
        secondary: '#a39d8f',
        primary: '#cfc8b8',
        motorway: '#f2ecdd',
      },
    },
    casing: '#16161a',
    strokeScale: 1.5,
    overlayText: '#f5f1e6',
    overlaySub: 'rgba(245,241,230,0.72)',
    caption: 'Warm bone-white streets on charcoal.',
  }),
  vectorTheme({
    id: 'cyber-glitch',
    name: 'Cyber Glitch',
    category: 'artistic',
    palette: {
      bg: '#0b0b16',
      water: '#071020',
      parks: '#111122',
      roads: {
        // Muted from MapToPoster's cyber_noir: at full brightness the cyan arterials
        // outshone the traffic, and traffic is the one thing a Maceut map must lead
        // with. The hierarchy is kept, just a few steps down.
        default: '#082d33',
        minor: '#0b434a',
        tertiary: '#0d6168',
        secondary: '#0e8088',
        primary: '#139fae',
        motorway: '#b21aa2',
      },
    },
    casing: '#0b0b16',
    strokeScale: 1.5,
    overlayText: '#e6faff',
    overlaySub: 'rgba(0,229,229,0.85)',
    caption: 'Magenta freeways cutting through a cyan grid.',
  }),
  vectorTheme({
    id: 'midnight-neon',
    name: 'Midnight Neon',
    category: 'artistic',
    palette: {
      bg: '#05081c',
      water: '#0a1433',
      parks: '#0a1226',
      roads: {
        default: '#142060',
        minor: '#1a2c80',
        tertiary: '#2b4bd8',
        secondary: '#3d6af0',
        primary: '#5b8cff',
        motorway: '#a9c4ff',
      },
    },
    casing: '#05081c',
    strokeScale: 1.5,
    overlayText: '#eaf1ff',
    overlaySub: 'rgba(160,190,255,0.82)',
    caption: 'A city at 2 a.m. — navy dark, lit by its own roads.',
  }),
  vectorTheme({
    id: 'sakura-bloom',
    name: 'Sakura Bloom',
    category: 'artistic',
    palette: {
      bg: '#1e0b18',
      water: '#3a1230',
      parks: '#2a1022',
      roads: {
        default: '#431933',
        minor: '#5c2446',
        tertiary: '#8a3c64',
        secondary: '#ad5283',
        primary: '#cc6d9e',
        motorway: '#e8a9c6',
      },
    },
    casing: '#1e0b18',
    strokeScale: 1.5,
    overlayText: '#ffe9f2',
    overlaySub: 'rgba(255,214,235,0.82)',
    caption: 'Plum night and blossom-pink streets.',
  }),
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

/**
 * Esri's free World Imagery basemap — no API key, `Access-Control-Allow-Origin: *`
 * confirmed directly before this was wired in. Its path order is `{z}/{y}/{x}`,
 * the reverse of OSM's `{z}/{x}/{y}`; getting that swapped silently draws the wrong
 * hemisphere's tiles rather than erroring, so it is worth stating plainly here.
 */
const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

function satelliteTileUrl(z: number, x: number, y: number): string {
  return SATELLITE_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}

/**
 * Filtered basemap layers, keyed by theme and viewport.
 *
 * The basemap is the same from one frame to the next — only the traffic changes — but
 * drawing it is the expensive part: thousands of vector road segments, or every
 * satellite tile run through a CSS filter. At export resolution the filtered version
 * measured ~700 ms per frame: far over the 250 ms a frame gets at 4×
 * playback. Traffic is clipped to the zone polygon, so the viewport (fitted to the
 * ring) is identical for every frame of a zone, and this cache hits for the whole of
 * playback. Small, because each entry is a full-size canvas.
 */
const basemapLayers = new Map<string, HTMLCanvasElement>()
const BASEMAP_LAYER_LIMIT = 4

async function basemapLayer(v: Viewport, input: RenderInput): Promise<HTMLCanvasElement> {
  const key = [
    input.theme.id,
    v.zoom,
    Math.round(v.originX),
    Math.round(v.originY),
    input.width,
    input.height,
  ].join('|')
  const hit = basemapLayers.get(key)
  if (hit) return hit

  const layer = document.createElement('canvas')
  layer.width = input.width
  layer.height = input.height
  const lctx = layer.getContext('2d')
  if (!lctx) return layer
  let complete: boolean
  if (input.theme.basemap === 'vector' && input.theme.palette) {
    complete = await drawVectorBasemap(
      lctx,
      { zoom: v.zoom, originX: v.originX, originY: v.originY, width: input.width, height: input.height },
      input.theme.palette,
    )
  } else {
    // The filter sits on the basemap layer alone. Applying it to the whole canvas
    // would push the traffic colours through it too, and a congestion theme's
    // "congested" red run through a filter is no longer the red its legend promises.
    if (input.theme.rasterFilter) lctx.filter = input.theme.rasterFilter
    complete = await drawSatellite(lctx, v, input)
  }

  // Only a layer with every tile in it is worth keeping — caching one with a gap
  // would freeze the gap into every later frame.
  if (complete) {
    basemapLayers.set(key, layer)
    if (basemapLayers.size > BASEMAP_LAYER_LIMIT) {
      basemapLayers.delete(basemapLayers.keys().next().value!)
    }
  }
  return layer
}

/** Draws the tiles for `v`. Resolves true when every tile loaded. */
async function drawSatellite(ctx: CanvasRenderingContext2D, v: Viewport, input: RenderInput): Promise<boolean> {
  const first = { x: Math.floor(v.originX / TILE_SIZE), y: Math.floor(v.originY / TILE_SIZE) }
  const last = {
    x: Math.floor((v.originX + input.width) / TILE_SIZE),
    y: Math.floor((v.originY + input.height) / TILE_SIZE),
  }
  const max = 2 ** v.zoom

  const jobs: Promise<boolean>[] = []
  for (let x = first.x; x <= last.x; x++) {
    for (let y = first.y; y <= last.y; y++) {
      if (y < 0 || y >= max) continue
      const wrapped = ((x % max) + max) % max
      const url = satelliteTileUrl(v.zoom, wrapped, y)
      const dx = x * TILE_SIZE - v.originX
      const dy = y * TILE_SIZE - v.originY
      jobs.push(
        loadTile(url).then((img) => {
          if (!img) return false
          ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE)
          return true
        }),
      )
    }
  }
  return (await Promise.all(jobs)).every(Boolean)
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

  ctx.save()
  ctx.textAlign = anchor.align
  ctx.lineJoin = 'round'
  // The caption sits on a dense street grid, so each line gets a halo in the map's
  // own ground colour: the streets stop just short of the letters, the way printed
  // city maps knock out the roads under a label. Satellite has no single ground
  // colour to use, so imagery keeps a soft dark shadow instead.
  const halo = input.theme.basemap === 'vector'
  if (!halo) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = unit
  }

  for (const line of lines) {
    ctx.font = `${line.weight} ${line.size}px ui-sans-serif, system-ui, sans-serif`
    if (halo) {
      ctx.strokeStyle = theme.background
      // Floored on the caption's unit, not the line's own size: a halo proportional to
      // the small date line was too thin to stop a main road cutting between its words.
      ctx.lineWidth = Math.max(line.size * 0.28, unit * 0.7, 3)
      ctx.strokeText(line.text, anchor.x, y)
    }
    ctx.fillStyle = line.color
    ctx.fillText(line.text, anchor.x, y)
    y += line.size * 1.15 + line.gapAfter
  }
  ctx.restore()
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

  ctx.drawImage(await basemapLayer(v, input), 0, 0)

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

  drawTraffic(ctx, input, v)

  if (input.overlay.showText) drawText(ctx, input)
  if (input.overlay.legend) drawLegend(ctx, input)
  drawAttribution(ctx, input)
}

/**
 * Traffic last among the map layers, so a road is never hidden by the boundary fill.
 *
 * Two passes, the way MapToPoster draws its route: every road's casing (ground colour,
 * a little wider) first, then every coloured line. Casings all go down before any
 * colour so one road's casing never cuts through the colour of a road it crosses.
 * Lines are batched into one path per colour — four strokes, not thousands.
 */
function drawTraffic(ctx: CanvasRenderingContext2D, input: RenderInput, v: Viewport) {
  const weight = Math.max((input.height / 300) * input.theme.strokeScale, 1.5)
  const casing = new Path2D()
  const byColour = new Map<string, Path2D>()

  for (const feature of input.traffic?.features ?? []) {
    if (feature.c.length < 2) continue
    // Remapped through the active congestion theme. `feature.k` is always one of
    // BR-017's four hexes; an unrecognised value (there should be none) falls back to
    // itself rather than vanishing.
    const colour = input.congestion.map[feature.k] ?? feature.k
    let path = byColour.get(colour)
    if (!path) {
      path = new Path2D()
      byColour.set(colour, path)
    }
    feature.c.forEach(([lng, lat], i) => {
      const [x, y] = project(lng, lat, v)
      if (i === 0) {
        casing.moveTo(x, y)
        path.moveTo(x, y)
      } else {
        casing.lineTo(x, y)
        path.lineTo(x, y)
      }
    })
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = input.theme.casing
  ctx.lineWidth = weight + Math.max(input.height / 500, 2)
  ctx.stroke(casing)
  ctx.lineWidth = weight
  for (const [colour, path] of byColour) {
    ctx.strokeStyle = colour
    ctx.stroke(path)
  }
  ctx.restore()
}

/**
 * The map's credit, small in the bottom-right corner. Not optional: OpenStreetMap's
 * ODbL licence requires attribution on published maps, and Esri's imagery terms do the
 * same. Earlier exports carried none.
 */
function drawAttribution(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const text =
    input.theme.basemap === 'satellite'
      ? 'Imagery © Esri, Maxar, Earthstar Geographics'
      : '© OpenStreetMap contributors · OpenFreeMap'
  const size = Math.max(Math.round(input.height / 90), 9)
  ctx.save()
  ctx.font = `500 ${size}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  const x = input.width - Math.round(input.width * 0.012)
  const y = input.height - Math.round(input.height * 0.012)
  if (input.theme.basemap === 'vector') {
    // Same knock-out halo as the caption, so it stays legible over a busy street.
    ctx.lineJoin = 'round'
    ctx.strokeStyle = input.theme.background
    ctx.lineWidth = Math.max(size * 0.35, 2)
    ctx.strokeText(text, x, y)
  }
  ctx.globalAlpha = 0.85
  ctx.fillStyle = input.theme.overlaySub
  ctx.fillText(text, x, y)
  ctx.restore()
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
