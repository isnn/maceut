/**
 * OpenStreetMap vector tiles, decoded and drawn by hand — the detailed street map
 * behind Studio's themes.
 *
 * The look comes from maptoposter.tarmizi.id (MIT, github.com/dimartarmizi/map-to-poster),
 * and the trick behind it is smaller than it looks: no labels, no buildings, just a
 * background, water, parks and the road network split by class, each class given a
 * colour. Raster tiles can't do that — the colours are baked into the picture, which is
 * why the old themes had to push OSM's own tiles through CSS filters and still lost the
 * small streets. Vector tiles carry every road as geometry with a `class`, so a theme
 * is just a palette.
 *
 * Tiles come from OpenFreeMap: free, no key, `Access-Control-Allow-Origin: *` (checked
 * before this was written), OpenMapTiles schema. MapToPoster renders them with
 * MapLibre GL; here they are decoded with a ~150-line protobuf reader and drawn into
 * the same canvas as everything else, so the preview is still exactly the export and
 * no new dependency was needed.
 */

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet'

/** OpenMapTiles' own zoom ceiling. Past it, z14 geometry is scaled — vectors stay sharp. */
const MAX_TILE_ZOOM = 14

// --- palette ---------------------------------------------------------------------

export type RoadBucket = 'motorway' | 'primary' | 'secondary' | 'tertiary' | 'minor' | 'default'

export interface VectorPalette {
  bg: string
  water: string
  parks: string
  roads: Record<RoadBucket, string>
}

/**
 * Stroke widths at a 1000px-tall image, MapToPoster's own values. Scaled with the image
 * so a 1080 and a 1920 poster carry the same weight of line.
 */
const ROAD_WIDTH: Record<RoadBucket, number> = {
  default: 0.5,
  minor: 0.6,
  tertiary: 0.9,
  secondary: 1.1,
  primary: 1.6,
  motorway: 2.2,
}

/**
 * The zoom (on our 256px grid) at which each class appears. Below it the class is
 * dropped; one level below, it is drawn faint — so zooming out thins the network out
 * gradually instead of collapsing into a solid mesh of hairlines, and zooming in brings
 * the small streets back. The main roads are always drawn: they are what gives a city
 * its shape at any scale.
 */
const ROAD_MIN_ZOOM: Record<RoadBucket, number> = {
  default: 14,
  minor: 13,
  tertiary: 11,
  secondary: 0,
  primary: 0,
  motorway: 0,
}

function roadOpacity(bucket: RoadBucket, zoom: number): number {
  const min = ROAD_MIN_ZOOM[bucket]
  // A ramp over the zoom step below `min`, so with fractional zoom (wheel, fine slider)
  // the small streets fade in continuously instead of popping on at one notch.
  return Math.min(Math.max(zoom - (min - 1), 0), 1)
}

/**
 * Line weight grows with zoom, as it does on any slippy map: a street drawn at its
 * city-scale width looks like a thread once you're looking at a few blocks. ×~1.6 per
 * step, anchored so z14 is exactly MapToPoster's weight. The first version grew only
 * ×1.27 per step and capped at 2.4×, so zoomed in the map read as a hairline wireframe.
 */
export function roadWidthScale(zoom: number): number {
  return Math.min(Math.max(2 ** ((zoom - 14) * 0.7), 0.6), 14)
}

/** Smallest first, so the arterials are drawn over the streets that meet them. */
const ROAD_ORDER: RoadBucket[] = ['default', 'minor', 'tertiary', 'secondary', 'primary', 'motorway']

/**
 * OpenMapTiles classes into the six styled buckets. Note `minor` — the schema has no
 * `residential` class, though MapToPoster's own style filters on one (it matches
 * nothing there, and those streets fall through to its default layer).
 */
function bucketFor(cls: unknown): RoadBucket | null {
  switch (cls) {
    case 'motorway':
      return 'motorway'
    case 'trunk':
    case 'primary':
      return 'primary'
    case 'secondary':
      return 'secondary'
    case 'tertiary':
      return 'tertiary'
    case 'minor':
    case 'service':
      return 'minor'
    // A ferry is a line across open water; drawn as a road it reads as a bridge.
    case 'ferry':
      return null
    default:
      return 'default'
  }
}

// --- protobuf ------------------------------------------------------------------

/** Just enough protobuf for the Mapbox Vector Tile schema. */
class Reader {
  pos = 0
  readonly buf: Uint8Array
  constructor(buf: Uint8Array) {
    this.buf = buf
  }

  varint(): number {
    // Multiplication rather than bit shifts: shifts are 32-bit in JS, and a uint64
    // value past 2^31 would come back negative.
    let result = 0
    let mul = 1
    for (;;) {
      const b = this.buf[this.pos++]!
      result += (b & 0x7f) * mul
      if (b < 0x80) return result
      mul *= 128
    }
  }

  bytes(): Uint8Array {
    const len = this.varint()
    const out = this.buf.subarray(this.pos, this.pos + len)
    this.pos += len
    return out
  }

  skip(wireType: number) {
    if (wireType === 0) this.varint()
    else if (wireType === 1) this.pos += 8
    else if (wireType === 2) this.pos += this.varint()
    else if (wireType === 5) this.pos += 4
    else throw new Error(`Unsupported protobuf wire type ${wireType}`)
  }

  packed(): number[] {
    const end = this.varint() + this.pos
    const out: number[] = []
    while (this.pos < end) out.push(this.varint())
    return out
  }
}

const textDecoder = new TextDecoder()

function zigzag(n: number): number {
  return n % 2 === 0 ? n / 2 : -(n + 1) / 2
}

// --- MVT decode ----------------------------------------------------------------

/** A line or ring as flat [x0, y0, x1, y1, …] in tile units. */
type Flat = number[]

export interface DecodedTile {
  extent: number
  /** One entry per feature; each feature is its rings. */
  water: Flat[][]
  park: Flat[][]
  roads: Record<RoadBucket, Flat[]>
}

const WANTED = new Set(['water', 'park', 'transportation'])

/** A `Value` message. Only strings matter here (`class`), but every kind is read so the cursor stays right. */
function readValue(buf: Uint8Array): string | number | boolean | null {
  const r = new Reader(buf)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let value: string | number | boolean | null = null
  while (r.pos < buf.length) {
    const tag = r.varint()
    const field = tag >> 3
    const wire = tag & 7
    if (field === 1) value = textDecoder.decode(r.bytes())
    else if (field === 2) {
      value = view.getFloat32(r.pos, true)
      r.pos += 4
    } else if (field === 3) {
      value = view.getFloat64(r.pos, true)
      r.pos += 8
    } else if (field === 4 || field === 5) value = r.varint()
    else if (field === 6) value = zigzag(r.varint())
    else if (field === 7) value = r.varint() !== 0
    else r.skip(wire)
  }
  return value
}

/** Geometry commands into flat lines/rings. ClosePath repeats the first point. */
function decodeGeometry(geom: number[]): Flat[] {
  const parts: Flat[] = []
  let current: Flat | null = null
  let x = 0
  let y = 0
  let i = 0
  while (i < geom.length) {
    const command = geom[i++]!
    const id = command & 7
    const count = command >> 3
    if (id === 1 || id === 2) {
      for (let c = 0; c < count; c++) {
        x += zigzag(geom[i++]!)
        y += zigzag(geom[i++]!)
        if (id === 1) {
          current = [x, y]
          parts.push(current)
        } else {
          current?.push(x, y)
        }
      }
    } else if (id === 7 && current && current.length >= 2) {
      current.push(current[0]!, current[1]!)
    }
  }
  return parts
}

export function decodeTile(buf: Uint8Array): DecodedTile {
  const tile: DecodedTile = {
    extent: 4096,
    water: [],
    park: [],
    roads: { default: [], minor: [], tertiary: [], secondary: [], primary: [], motorway: [] },
  }

  const r = new Reader(buf)
  while (r.pos < buf.length) {
    const tag = r.varint()
    if (tag >> 3 !== 3) {
      r.skip(tag & 7)
      continue
    }
    readLayer(r.bytes(), tile)
  }
  return tile
}

/**
 * One layer. Its name may come after its features in the byte stream, so features are
 * collected as byte ranges first and only decoded once the name says the layer is one
 * of the three drawn — buildings, labels and POIs are never walked.
 */
function readLayer(buf: Uint8Array, tile: DecodedTile) {
  const r = new Reader(buf)
  let name = ''
  let extent = 4096
  const keys: string[] = []
  const values: (string | number | boolean | null)[] = []
  const features: Uint8Array[] = []

  while (r.pos < buf.length) {
    const tag = r.varint()
    const field = tag >> 3
    if (field === 1) name = textDecoder.decode(r.bytes())
    else if (field === 2) features.push(r.bytes())
    else if (field === 3) keys.push(textDecoder.decode(r.bytes()))
    else if (field === 4) values.push(readValue(r.bytes()))
    else if (field === 5) extent = r.varint()
    else r.skip(tag & 7)
  }

  if (!WANTED.has(name)) return
  tile.extent = extent
  const classKey = keys.indexOf('class')

  for (const bytes of features) {
    const f = new Reader(bytes)
    let tags: number[] = []
    let type = 0
    let geometry: number[] = []
    while (f.pos < bytes.length) {
      const tag = f.varint()
      const field = tag >> 3
      if (field === 2) tags = f.packed()
      else if (field === 3) type = f.varint()
      else if (field === 4) geometry = f.packed()
      else f.skip(tag & 7)
    }

    if (name === 'transportation') {
      if (type !== 2) continue
      let cls: unknown = null
      for (let t = 0; t + 1 < tags.length; t += 2) {
        if (tags[t] === classKey) cls = values[tags[t + 1]!]
      }
      const bucket = bucketFor(cls)
      if (bucket) tile.roads[bucket].push(...decodeGeometry(geometry))
    } else if (type === 3) {
      tile[name as 'water' | 'park'].push(decodeGeometry(geometry))
    }
  }
}

// --- fetching ----------------------------------------------------------------------

let tileTemplate: Promise<string | null> | null = null

/**
 * The tile URL template, read from the tilejson rather than hard-coded: OpenFreeMap
 * publishes each planet build under a dated path (`/20260913_164504_pt/`) and retires
 * old ones, so a pinned URL would quietly start 404ing.
 */
function template(): Promise<string | null> {
  tileTemplate ??= fetch(TILEJSON_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { tiles?: string[] } | null) => json?.tiles?.[0] ?? null)
    .catch(() => null)
    .then((url) => {
      // A failed lookup is not remembered — the next render tries again.
      if (!url) tileTemplate = null
      return url
    })
  return tileTemplate
}

const TILE_CACHE_LIMIT = 64
const tiles = new Map<string, Promise<DecodedTile | null>>()

/**
 * One decoded tile, cached so a theme switch redraws from memory. The promise is what
 * is cached, so two renders asking at once share one fetch. Failures resolve to null
 * and are dropped from the cache — one missing square leaves a gap, not a dead render.
 */
function loadVectorTile(z: number, x: number, y: number): Promise<DecodedTile | null> {
  const key = `${z}/${x}/${y}`
  const hit = tiles.get(key)
  if (hit) return hit

  const job = template()
    .then((url) => {
      if (!url) return null
      return fetch(url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
    })
    .then(async (res) => (res && res.ok ? decodeTile(new Uint8Array(await res.arrayBuffer())) : null))
    .catch(() => null)
    .then((tile) => {
      if (!tile) tiles.delete(key)
      return tile
    })

  tiles.set(key, job)
  if (tiles.size > TILE_CACHE_LIMIT) tiles.delete(tiles.keys().next().value!)
  return job
}

// --- drawing -------------------------------------------------------------------

export interface VectorView {
  /** The render's zoom on a 256px tile grid — what geometry is projected at. */
  zoom: number
  /**
   * The same view's zoom on a 1000px image. Which tiles, which road classes and how
   * thick they draw all follow this, so every output size shows the same map.
   */
  detail: number
  originX: number
  originY: number
  width: number
  height: number
}

function tracePath(ctx: CanvasRenderingContext2D, flat: Flat, dx: number, dy: number, k: number) {
  ctx.moveTo(dx + flat[0]! * k, dy + flat[1]! * k)
  for (let i = 2; i < flat.length; i += 2) ctx.lineTo(dx + flat[i]! * k, dy + flat[i + 1]! * k)
}

/**
 * Draws the styled street map for `view`. Resolves true only when every tile arrived,
 * which is what lets the caller cache the result — caching a map with a hole in it
 * would freeze the hole into every later frame.
 */
export async function drawVectorBasemap(
  ctx: CanvasRenderingContext2D,
  view: VectorView,
  palette: VectorPalette,
): Promise<boolean> {
  // One zoom below the render's: our grid is 256px tiles, OpenMapTiles is built for
  // 512px, so this is the detail MapLibre itself would show — at a quarter the tiles.
  // Floored: the render zoom can be fractional, tiles only exist at whole zooms. The
  // remainder is taken up by `tilePx`, and vector geometry scales without blurring.
  const tz = Math.min(Math.max(Math.floor(view.detail) - 1, 0), MAX_TILE_ZOOM)
  const tilePx = 256 * 2 ** (view.zoom - tz)
  const max = 2 ** tz

  const jobs: Promise<{ tile: DecodedTile | null; dx: number; dy: number }>[] = []
  for (let tx = Math.floor(view.originX / tilePx); tx <= Math.floor((view.originX + view.width) / tilePx); tx++) {
    for (let ty = Math.floor(view.originY / tilePx); ty <= Math.floor((view.originY + view.height) / tilePx); ty++) {
      if (ty < 0 || ty >= max) continue
      const wrapped = ((tx % max) + max) % max
      const dx = tx * tilePx - view.originX
      const dy = ty * tilePx - view.originY
      jobs.push(loadVectorTile(tz, wrapped, ty).then((tile) => ({ tile, dx, dy })))
    }
  }
  const placed = await Promise.all(jobs)

  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, view.width, view.height)

  const lineScale = Math.max(Math.min(view.width, view.height) / 1000, 0.5) * roadWidthScale(view.detail)

  /**
   * Layer by layer across ALL tiles, not tile by tile — otherwise the water in one
   * tile would be painted over a road that crosses in from its neighbour. Each tile
   * is clipped to its own square: tiles carry a buffer past their edge, and polygons
   * are cut with artificial edges out in that buffer that should never show.
   */
  const eachTile = (draw: (tile: DecodedTile, dx: number, dy: number, k: number) => void) => {
    for (const { tile, dx, dy } of placed) {
      if (!tile) continue
      ctx.save()
      ctx.beginPath()
      ctx.rect(dx, dy, tilePx, tilePx)
      ctx.clip()
      draw(tile, dx, dy, tilePx / tile.extent)
      ctx.restore()
    }
  }

  for (const [layer, color] of [
    ['water', palette.water],
    ['park', palette.parks],
  ] as const) {
    eachTile((tile, dx, dy, k) => {
      ctx.fillStyle = color
      for (const rings of tile[layer]) {
        ctx.beginPath()
        for (const ring of rings) tracePath(ctx, ring, dx, dy, k)
        // Even-odd so a lake's island, or a river's sandbar, is cut back out.
        ctx.fill('evenodd')
      }
    })
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const bucket of ROAD_ORDER) {
    const opacity = roadOpacity(bucket, view.detail)
    if (opacity === 0) continue
    eachTile((tile, dx, dy, k) => {
      const lines = tile.roads[bucket]
      if (lines.length === 0) return
      ctx.beginPath()
      for (const line of lines) tracePath(ctx, line, dx, dy, k)
      ctx.globalAlpha = opacity
      ctx.strokeStyle = palette.roads[bucket]
      ctx.lineWidth = ROAD_WIDTH[bucket] * lineScale
      ctx.stroke()
    })
  }

  return placed.every((p) => p.tile !== null)
}
