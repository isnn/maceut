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
import { drawVectorBasemap, roadWidthScale, type VectorPalette } from './vector-tiles'

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
}

type VectorThemeSpec = Omit<MapTheme, 'basemap' | 'swatch' | 'background'> & { palette: VectorPalette }

/** A vector theme's card swatch is its own palette: ground, motorway, primary, water. */
function vectorTheme(spec: VectorThemeSpec): MapTheme {
  const { palette } = spec
  return {
    ...spec,
    basemap: 'vector',
    background: palette.bg,
    swatch: distinctSwatch(palette),
  }
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Four visibly different circles for the theme card: the ground first, then greedily
 * the palette colour farthest from those already picked. A fixed pick (ground,
 * motorway, primary, water) gave near-identical first and last circles on dark themes
 * whose water is a shade off the ground, and two yellows on Cyber Glitch.
 */
function distinctSwatch(palette: VectorPalette): string[] {
  const pool = [palette.water, palette.parks, ...Object.values(palette.roads)]
  const picked = [palette.bg]
  while (picked.length < 4 && pool.length > 0) {
    let best = 0
    let bestScore = -1
    pool.forEach((c, i) => {
      const [r, g, b] = rgbOf(c)
      const score = Math.min(
        ...picked.map((p) => {
          const [pr, pg, pb] = rgbOf(p)
          return (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        }),
      )
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    })
    picked.push(pool.splice(best, 1)[0]!)
  }
  return picked
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
  },

  // --- artistic ---
  vectorTheme({
    id: 'charcoal',
    name: 'Charcoal',
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
  }),
  vectorTheme({
    id: 'cyber-glitch',
    name: 'Cyber Glitch',
    category: 'artistic',
    // MapToPoster's own `cyber_glitch`, colour for colour. `minor` takes their
    // road_default, not their road_residential: their style filters on a `residential`
    // class OpenMapTiles never emits, so on their site every small street is drawn in
    // the default colour — and that is the look being copied.
    palette: {
      bg: '#2e1065',
      water: '#4c1d95',
      parks: '#581c87',
      roads: {
        default: '#a855f7',
        minor: '#a855f7',
        tertiary: '#c084fc',
        secondary: '#a855f7',
        primary: '#eab308',
        motorway: '#facc15',
      },
    },
    casing: '#2e1065',
    strokeScale: 1.5,
    overlayText: '#f0abfc',
    overlaySub: 'rgba(240,171,252,0.8)',
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
  }),
  vectorTheme({
    id: 'sakura-bloom',
    name: 'Sakura Bloom',
    category: 'artistic',
    // MapToPoster's own `sakura_bloom` — a light theme there, so it is one here too.
    // Same road_default-for-minor note as Cyber Glitch.
    palette: {
      bg: '#fff1f2',
      water: '#ffe4e6',
      parks: '#fbcfe8',
      roads: {
        default: '#f9a8d4',
        minor: '#f9a8d4',
        tertiary: '#f472b6',
        secondary: '#f9a8d4',
        primary: '#fda4af',
        motorway: '#fb7185',
      },
    },
    casing: '#fff1f2',
    strokeScale: 1.5,
    overlayText: '#881337',
    overlaySub: 'rgba(136,19,55,0.75)',
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
    name: 'Standard',
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
  /** `main` sizes get their own card; `more` sit behind the "Other" card. */
  group: 'main' | 'more'
}

/**
 * maptoposter.tarmizi.id's three preset shapes as the main cards, the rest behind
 * "Other" — including the 1600×1000 this renderer shipped with first, kept as
 * "Classic" so an export made last week and one made today can still match.
 */
export const OUTPUT_SIZES: OutputSize[] = [
  { id: 'square', name: 'Square', width: 1080, height: 1080, group: 'main' },
  { id: 'portrait', name: 'Portrait', width: 1080, height: 1920, group: 'main' },
  { id: 'landscape', name: 'Landscape', width: 1920, height: 1080, group: 'main' },
  { id: 'classic', name: 'Classic', width: 1600, height: 1000, group: 'more' },
  { id: 'social', name: 'Social post 4:5', width: 1080, height: 1350, group: 'more' },
  { id: 'a4', name: 'A4 print (300 dpi)', width: 2480, height: 3508, group: 'more' },
  { id: '4k', name: '4K widescreen', width: 3840, height: 2160, group: 'more' },
]

export const MIN_OUTPUT_PX = 200
export const MAX_OUTPUT_PX = 4000

// --- overlay ---------------------------------------------------------------------

/** The caption's size, or `none` to leave it off. Scales MapToPoster's own presets. */
export type TextSize = 'none' | 'small' | 'medium' | 'large'

export type TextAlign = 'left' | 'center' | 'right'

/**
 * Where the caption sits: a point as a fraction of the image, and which edge of the
 * block that point is. Fractions for the same reason as the pan — a caption dragged on
 * the preview must land in the same place on an export of any size.
 */
export interface TextPlacement {
  x: number
  y: number
  align: TextAlign
}

/** A finish over the map: MapToPoster's top-and-bottom fade, or nothing. */
export type OverlayEffect = 'none' | 'vignette'

export interface RenderOverlay {
  effect: OverlayEffect
  /** The caption's title. Empty means the zone's own name. */
  title: string
  textSize: TextSize
  text: TextPlacement
  legend: boolean
  boundary: boolean
}


// --- view (zoom / pan) ------------------------------------------------------------

export interface RenderView {
  /**
   * Steps away from the framing that fits the traffic + boundary with padding. May be
   * fractional — the wheel and the slider move in quarter steps.
   * Relative rather than an absolute zoom level: a zone the size of a district and
   * one the size of a neighbourhood need different absolute zooms to look "right",
   * but "one step closer than the automatic frame" means the same thing for both.
   */
  zoomOffset: number
  /**
   * Pan as a fraction of the canvas at the automatic framing (zoom offset 0) — not
   * pixels, and not a fraction of the current, zoomed view.
   *
   * Not pixels, because a pan set on the preview must land in the same place on an
   * export of any size. And not the current view, because that made the pan shrink
   * as you zoomed in: the drag was clamped to 60% of the view, so at +4 the map could
   * only move a sliver of the zone and felt stuck. Measured against the fitted view it
   * is a fixed geographic distance at every zoom, so zooming neither jumps the map nor
   * narrows how far it can travel.
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
  /** The zoom geometry is projected at — this image's own pixels. */
  zoom: number
  /**
   * The zoom the same view would have on a 1000px image. Street density, line weight
   * and which tiles to draw follow this, not `zoom`, so a 4000px export shows exactly
   * the map its 1000px-ish preview does — just sharper — instead of switching to a
   * busier level of detail because it has more pixels.
   */
  detail: number
  scale: number
  originX: number
  originY: number
}

/** The short side, in pixels, that a map's level of detail is judged at. */
const DETAIL_REF_PX = 1000

/** log2 of how much bigger than the reference this image is. */
function sizeShift(width: number, height: number): number {
  return Math.log2(Math.min(width, height) / DETAIL_REF_PX)
}

/**
 * The zoom that fits `bounds` into `width`×`height` with padding — exact, not rounded.
 *
 * This used to step down through whole zooms until the zone fit. That made the framing
 * depend on the pixel size: a 1080 and a 1920 image of the same zone each rounded
 * differently, so they showed different amounts of map, and an export above the 2400px
 * preview cap never matched its preview. Tiles can now be drawn at fractional zooms,
 * so the fit can be exact, and every size frames the zone identically.
 */
function fitZoom(bounds: Bounds, width: number, height: number, padding: number): number {
  const w0 = Math.abs(lngToWorldX(bounds.east, TILE_SIZE) - lngToWorldX(bounds.west, TILE_SIZE))
  const h0 = Math.abs(latToWorldY(bounds.south, TILE_SIZE) - latToWorldY(bounds.north, TILE_SIZE))
  const zx = w0 > 0 ? Math.log2((width * (1 - padding * 2)) / w0) : 18
  const zy = h0 > 0 ? Math.log2((height * (1 - padding * 2)) / h0) : 18
  return Math.min(Math.max(Math.min(zx, zy), 1), 18 + sizeShift(width, height))
}

/** The fitted view's detail zoom — `fitZoom` expressed at the 1000px reference. */
function fitDetail(bounds: Bounds, width: number, height: number, padding: number): number {
  return fitZoom(bounds, width, height, padding) - sizeShift(width, height)
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
/**
 * The deepest zoom each basemap can draw. Vector geometry is scaled past OpenMapTiles'
 * z14 and stays sharp, so it can go close enough to see a single intersection. Esri's
 * imagery runs out around z19 (past that it serves a "no imagery" placeholder). The
 * old flat cap of 18 made the top half of the zoom slider do nothing on a typical zone.
 */
function maxZoomFor(theme: MapTheme): number {
  return theme.basemap === 'satellite' ? 19 : 22
}

/** How far the zoom slider can go from the automatic framing, for this zone and size. */
export function zoomLimits(input: RenderInput): { min: number; max: number } {
  const base = fitDetail(boundsOf(input), input.width, input.height, 0.06)
  // Quarter steps, matching the slider — a limit between two steps would be unreachable.
  return {
    min: Math.ceil(Math.max(1 - base, -3) * 4) / 4,
    max: Math.floor(Math.min(maxZoomFor(input.theme) - base, 10) * 4) / 4,
  }
}

function computeViewport(
  bounds: Bounds,
  width: number,
  height: number,
  view: RenderView,
  maxZoom: number,
  padding = 0.06,
): Viewport {
  // Zoom limits and the offset apply to the detail zoom, so the clamp lands at the
  // same framing on every image size; the projection zoom is that plus the size shift.
  const shift = sizeShift(width, height)
  const base = fitDetail(bounds, width, height, padding)
  const detail = Math.min(Math.max(base + view.zoomOffset, 1), maxZoom)
  const zoom = detail + shift
  const scale = TILE_SIZE * 2 ** zoom

  const centreLng = (bounds.east + bounds.west) / 2
  const centreLat = (bounds.north + bounds.south) / 2
  const centreX = lngToWorldX(centreLng, scale)
  const centreY = latToWorldY(centreLat, scale)

  // The pan is in fitted-view units; at a closer zoom the same distance is more pixels.
  const zoomFactor = 2 ** (detail - base)
  return {
    zoom,
    detail,
    scale,
    originX: centreX - width / 2 - view.panX * width * zoomFactor,
    originY: centreY - height / 2 - view.panY * height * zoomFactor,
  }
}

/**
 * How many screen fractions one fitted-view fraction is at this input's zoom. The
 * page divides a drag by this so the map follows the pointer exactly at any zoom.
 */
export function panScale(input: RenderInput): number {
  const bounds = boundsOf(input)
  const base = fitDetail(bounds, input.width, input.height, 0.06)
  const detail = Math.min(Math.max(base + input.view.zoomOffset, 1), maxZoomFor(input.theme))
  return 2 ** (detail - base)
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
      { zoom: v.zoom, detail: v.detail, originX: v.originX, originY: v.originY, width: input.width, height: input.height },
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
  // Imagery exists only at whole zooms; a fractional render zoom draws the tiles of the
  // zoom below, scaled up by the remainder (at most 2×).
  // Imagery stops at z19; past that the z19 tiles are scaled up.
  const tileZoom = Math.min(Math.floor(v.zoom), 19)
  const size = TILE_SIZE * 2 ** (v.zoom - tileZoom)
  const first = { x: Math.floor(v.originX / size), y: Math.floor(v.originY / size) }
  const last = {
    x: Math.floor((v.originX + input.width) / size),
    y: Math.floor((v.originY + input.height) / size),
  }
  const max = 2 ** tileZoom

  const jobs: Promise<boolean>[] = []
  for (let x = first.x; x <= last.x; x++) {
    for (let y = first.y; y <= last.y; y++) {
      if (y < 0 || y >= max) continue
      const wrapped = ((x % max) + max) % max
      const url = satelliteTileUrl(tileZoom, wrapped, y)
      const dx = x * size - v.originX
      const dy = y * size - v.originY
      jobs.push(
        loadTile(url).then((img) => {
          if (!img) return false
          ctx.drawImage(img, dx, dy, size, size)
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

/** MapToPoster's size presets — its whole type scale is multiplied by one of these. */
const TEXT_SCALE: Record<Exclude<TextSize, 'none'>, number> = { small: 0.75, medium: 1, large: 1.35 }

/**
 * The caption's typefaces: web fonts the app self-hosts (next/font, root layout), read
 * from their CSS variables — never system fonts.
 *
 * Exports are rendered by the worker's headless Chromium, which has almost no fonts
 * installed. With `ui-serif`/`system-ui` the same caption set in a Mac preview and in
 * the server's file would be two different typefaces. Web fonts are the same bytes on
 * both, so the file matches the preview. The system stacks remain only as fallbacks.
 */
function fontFamily(cssVar: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const family = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
  return family ? `${family}, ${fallback}` : fallback
}
const serif = () => fontFamily('--font-poster-serif', 'Georgia, "Times New Roman", serif')
const sans = () => fontFamily('--font-inter', 'ui-sans-serif, system-ui, sans-serif')

/**
 * Waits until the caption's fonts are loaded. Canvas text does not wait for web fonts
 * on its own — it silently draws with the fallback — so an export rendered right after
 * page load would otherwise come out in the wrong typeface.
 */
export async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all([
    document.fonts.load(`700 64px ${serif()}`),
    document.fonts.load(`700 22px ${sans()}`),
    document.fonts.load(`500 16px ${sans()}`),
  ]).catch(() => undefined)
}

interface CaptionLine {
  text: string
  font: string
  size: number
  /** Letter-spacing in ems. */
  tracking: number
  /** Line box height as a multiple of `size`. */
  leading: number
  color: string
}

interface PlacedLine extends CaptionLine {
  x: number
  /** Vertical middle of the line box. */
  y: number
}

export interface CaptionBox {
  x: number
  y: number
  width: number
  height: number
}

interface CaptionLayout {
  box: CaptionBox
  lines: PlacedLine[]
  divider: CaptionBox
  /** Halo width for this caption size. */
  halo: number
}

function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  // `letterSpacing` is Chrome 99+/Firefox 115+/Safari 17+. Where it's missing the
  // caption simply sets tighter — nothing breaks.
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`
}

/** A line's drawn width, without the spacing canvas adds after its last letter. */
function lineWidth(ctx: CanvasRenderingContext2D, line: CaptionLine): number {
  ctx.font = line.font
  const tracking = line.tracking * line.size
  setTracking(ctx, tracking)
  return Math.max(ctx.measureText(line.text).width - tracking, 0)
}

/**
 * The caption, laid out the way MapToPoster sets its poster title: a tracked serif
 * name, a hairline rule, then smaller tracked lines — sized from a 1080px reference
 * on the image's short side, so small/medium/large and every output size keep the
 * same proportions. Spacing is theirs too: 12px between lines, 48px from the edge.
 *
 * The block is placed by `overlay.text` and then clamped inside the edge margin, so a
 * caption dragged too far stops at the edge instead of leaving the image.
 *
 * Shared by drawing and by `captionBox`, which the page uses to tell a drag on the
 * caption from a drag on the map — one layout, so the grab area is exactly the text.
 */
function layoutCaption(ctx: CanvasRenderingContext2D, input: RenderInput): CaptionLayout | null {
  const { overlay, theme, width, height } = input
  if (overlay.textSize === 'none') return null

  const q = (Math.min(width, height) / 1080) * TEXT_SCALE[overlay.textSize]
  const pad = 48 * q
  const gap = 12 * q
  const { date, time, day } = wibParts(input.capturedAt)

  // The title wraps onto up to three lines rather than shrinking to fit one: a long
  // title set in a single line got so small it stopped reading as a title. It only
  // shrinks when three lines still aren't enough, or one word alone is too wide.
  const title = (input.overlay.title.trim() || input.zoneName).toUpperCase()
  const maxWidth = width - pad * 2
  let heroSize = 64 * q
  const heroLine = (text: string, size: number): CaptionLine => ({
    text,
    font: `700 ${size}px ${serif()}`,
    size,
    tracking: 0.25,
    leading: 1.12,
    color: theme.overlayText,
  })
  const wrap = (size: number): CaptionLine[] => {
    const out: string[] = []
    let current = ''
    for (const word of title.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word
      if (current && lineWidth(ctx, heroLine(candidate, size)) > maxWidth) {
        out.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) out.push(current)
    return out.map((t) => heroLine(t, size))
  }
  let heroLines = wrap(heroSize)
  while (
    heroSize > 14 * q &&
    (heroLines.length > 3 || heroLines.some((l) => lineWidth(ctx, l) > maxWidth))
  ) {
    heroSize *= 0.92
    heroLines = wrap(heroSize)
  }

  const clock: CaptionLine = {
    text: `${time} WIB`,
    font: `700 ${22 * q}px ${sans()}`,
    size: 22 * q,
    tracking: 0.4,
    leading: 1.2,
    color: theme.overlayText,
  }
  const when: CaptionLine = {
    text: `${day} · ${date.toUpperCase()}`,
    font: `500 ${16 * q}px ${sans()}`,
    size: 16 * q,
    tracking: 0.4,
    leading: 1.2,
    color: theme.overlaySub,
  }

  const rule = { width: 128 * q, height: Math.max(q, 1) }
  const heroWidths = heroLines.map((l) => lineWidth(ctx, l))
  const clockWidth = lineWidth(ctx, clock)
  const whenWidth = lineWidth(ctx, when)
  const boxWidth = Math.max(...heroWidths, clockWidth, whenWidth, rule.width)
  // Title lines stack at their own leading; the 12px gap separates the blocks.
  const heroHeight = heroLines.reduce((sum, l) => sum + l.size * l.leading, 0)
  const clockHeight = clock.size * clock.leading
  const whenHeight = when.size * when.leading
  const boxHeight = heroHeight + gap + rule.height + gap + clockHeight + gap + whenHeight

  const { x: fx, y: fy, align } = overlay.text
  const anchorX = fx * width
  let left = align === 'left' ? anchorX : align === 'center' ? anchorX - boxWidth / 2 : anchorX - boxWidth
  let top = fy * height - boxHeight / 2
  left = boxWidth > width - pad * 2 ? pad : Math.min(Math.max(left, pad), width - pad - boxWidth)
  top = boxHeight > height - pad * 2 ? pad : Math.min(Math.max(top, pad), height - pad - boxHeight)

  const xFor = (w: number) => (align === 'left' ? left : align === 'center' ? left + (boxWidth - w) / 2 : left + boxWidth - w)

  let cursor = top
  const placed: PlacedLine[] = []
  heroLines.forEach((l, i) => {
    const h = l.size * l.leading
    placed.push({ ...l, x: xFor(heroWidths[i]!), y: cursor + h / 2 })
    cursor += h
  })
  cursor += gap
  const divider = { x: xFor(rule.width), y: cursor, width: rule.width, height: rule.height }
  cursor += rule.height + gap
  placed.push({ ...clock, x: xFor(clockWidth), y: cursor + clockHeight / 2 })
  cursor += clockHeight + gap
  placed.push({ ...when, x: xFor(whenWidth), y: cursor + whenHeight / 2 })

  return {
    box: { x: left, y: top, width: boxWidth, height: boxHeight },
    lines: placed,
    divider,
    halo: Math.max(10 * q, 2.5),
  }
}

let measureCtx: CanvasRenderingContext2D | null = null

/** The caption's bounds in image pixels, or null when it's hidden. */
export function captionBox(input: RenderInput): CaptionBox | null {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return null
  measureCtx.save()
  const layout = layoutCaption(measureCtx, input)
  measureCtx.restore()
  return layout?.box ?? null
}

function drawText(ctx: CanvasRenderingContext2D, input: RenderInput) {
  ctx.save()
  const layout = layoutCaption(ctx, input)
  if (!layout) {
    ctx.restore()
    return
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  // The caption sits on a dense street grid, so each line gets a halo in the map's
  // own ground colour: the streets stop just short of the letters, the way printed
  // city maps knock out the roads under a label. Satellite has no single ground
  // colour to use, so imagery keeps a soft dark shadow instead.
  const halo = input.theme.basemap === 'vector'
  if (!halo) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = layout.halo
  }

  // No outline — the user preferred the caption slightly translucent over any halo.
  ctx.globalAlpha = 0.9
  for (const line of layout.lines) {
    ctx.font = line.font
    setTracking(ctx, line.tracking * line.size)
    ctx.fillStyle = line.color
    ctx.fillText(line.text, line.x, line.y)
  }

  const { divider } = layout
  ctx.globalAlpha = 0.8
  ctx.fillStyle = input.theme.overlayText
  ctx.fillRect(divider.x, divider.y, divider.width, divider.height)
  ctx.restore()
}

/**
 * MapToPoster's default "vignette": the ground colour fading in over the top and bottom
 * of the poster (solid to 3%, clear by 20%, and back from 80%), so the map dissolves
 * into the page instead of stopping at a hard edge. Drawn over the map but under the
 * traffic, so no road's congestion is ever faded out.
 */
function drawVignette(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const solid = hexToRgba(input.theme.background, 1)
  const clear = hexToRgba(input.theme.background, 0)
  if (!solid || !clear) return
  const g = ctx.createLinearGradient(0, 0, 0, input.height)
  g.addColorStop(0, solid)
  g.addColorStop(0.03, solid)
  g.addColorStop(0.2, clear)
  g.addColorStop(0.8, clear)
  g.addColorStop(0.97, solid)
  g.addColorStop(1, solid)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, input.width, input.height)
}

function hexToRgba(hex: string, alpha: number): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
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
  await ensureFonts()
  canvas.width = input.width
  canvas.height = input.height
  await drawMap(ctx, input)
  drawOverlays(ctx, input)
}

/**
 * The map alone — ground, basemap, boundary, vignette, traffic — into its own canvas.
 *
 * The preview draws the map and the overlays on two stacked canvases, and the export
 * draws both into one (`renderCapture`), from these same two functions. Stacked, the
 * map can slide under a still caption while it's being dragged, and dragging the
 * caption redraws only the small overlay layer instead of the whole map.
 */
export async function renderMap(canvas: HTMLCanvasElement, input: RenderInput): Promise<void> {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = input.width
  canvas.height = input.height
  await drawMap(ctx, input)
}

/** Caption, legend and credit on a transparent canvas — synchronous, and cheap. */
export function renderOverlays(canvas: HTMLCanvasElement, input: RenderInput) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = input.width
  canvas.height = input.height
  drawOverlays(ctx, input)
}

function drawOverlays(ctx: CanvasRenderingContext2D, input: RenderInput) {
  drawText(ctx, input)
  if (input.overlay.legend) drawLegend(ctx, input)
  drawAttribution(ctx, input)
}

async function drawMap(ctx: CanvasRenderingContext2D, input: RenderInput) {
  ctx.fillStyle = input.theme.background
  ctx.fillRect(0, 0, input.width, input.height)

  const v = computeViewport(boundsOf(input), input.width, input.height, input.view, maxZoomFor(input.theme))

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
    ctx.lineWidth = Math.max(2 * (Math.min(input.width, input.height) / DETAIL_REF_PX), 1.5)
    ctx.stroke()
    ctx.restore()
  }

  if (input.overlay.effect === 'vignette') drawVignette(ctx, input)
  drawTraffic(ctx, input, v)
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
  // Traffic thickens with zoom as the streets under it do, but half as fast: close in,
  // a road on the map is wider than the traffic line, which then reads as a coloured
  // centre stripe — the way live-traffic maps draw it — rather than being swallowed.
  const zoomGrowth = Math.min(Math.max(Math.sqrt(roadWidthScale(v.detail)), 1), 2.5)
  const weight = Math.max((input.height / 300) * input.theme.strokeScale * zoomGrowth, 1.5)
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

// Animation exports are encoded by ffmpeg on the server from the same PNG frames as a
// ZIP (EXP-B, ADR-030); the in-browser MediaRecorder path that lived here is gone.

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
