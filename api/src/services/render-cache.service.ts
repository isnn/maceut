import { createHash } from 'node:crypto'

/**
 * When a rendered export frame can be reused instead of drawn again (EXP-A2).
 *
 * Two sources, both exact:
 *
 * 1. **The capture's own image (CAP-02).** Every collected capture is already drawn
 *    once, in the default capture style. If an export asks for exactly that style and
 *    size, the frame is that image.
 * 2. **The render cache.** Frames an export drew are kept for 7 days, keyed by a hash of
 *    everything that changes the picture. A retry, or a ZIP and a video of the same
 *    range and style, reads them back instead of drawing.
 *
 * `RENDER_VERSION` is part of every key and every comparison. **Bump it whenever the
 * web renderer's output changes** (`web/src/features/studio/render.ts`) — otherwise
 * frames drawn by the old renderer would be served as if they were current.
 */
export const RENDER_VERSION = 1

/** How long cached frames are kept. Matches the export retention. */
export const RENDER_CACHE_DAYS = 7

/** The parts of an export spec that change the picture. */
export interface PictureSpec {
  /** PNG unless a ZIP asked for WebP (EXP-C). Part of the key: the bytes differ. */
  imageFormat?: 'png' | 'webp'
  themeId: string
  congestionId: string
  overlay: unknown
  view: unknown
  width: number
  height: number
}

/** JSON with sorted keys, so equal specs always serialise the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function picture(spec: PictureSpec) {
  return {
    imageFormat: spec.imageFormat ?? 'png',
    themeId: spec.themeId,
    congestionId: spec.congestionId,
    overlay: spec.overlay,
    view: spec.view,
    width: spec.width,
    height: spec.height,
  }
}

/**
 * The cache key for one style of one zone. The zone is in it because the caption
 * prints its name and the boundary overlay draws its shape.
 */
export function specHash(spec: PictureSpec, zone: { id: string; name: string }): string {
  return createHash('sha256')
    .update(stableStringify({ v: RENDER_VERSION, ...picture(spec), zoneId: zone.id, zoneName: zone.name }))
    .digest('hex')
    .slice(0, 32)
}

export function cachePath(userId: string, hash: string, captureId: string, ext: 'png' | 'webp' = 'png'): string {
  return `render-cache/${userId}/${hash}/${captureId}.${ext}`
}

/**
 * True when an export frame would be pixel-for-pixel the capture's own image: same
 * style, same size, drawn by the same renderer version. Images stored before the
 * version was recorded never match — they may predate a renderer change.
 */
export function matchesCaptureImage(styleUsed: unknown, spec: PictureSpec): boolean {
  const used = styleUsed as (PictureSpec & { renderVersion?: number }) | null
  if (!used || used.renderVersion !== RENDER_VERSION) return false
  return stableStringify(picture(used)) === stableStringify(picture(spec))
}
