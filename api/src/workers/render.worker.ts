import type { Channel, ConsumeMessage } from 'amqplib'
import type { Browser } from 'playwright-core'
import { config, isR2Configured } from '../config/env'
import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import { slimTraffic } from '../services/capture.service'
import { capturePath, upload } from '../lib/r2-client'
import { launchBrowser, renderWithPage, type RenderPageJob } from '../lib/render-page'

/**
 * Renders one PNG per collected capture and stores it in R2 (CAP-02, BR-009, BR-011).
 *
 * A separate queue from the capture itself, on purpose:
 *
 * - **Memory.** Captures run four at a time; four headless browsers at once is how
 *   this host OOM-kills processes. Renders run one at a time, on ONE shared
 *   Chromium that opens a page per image and closes a minute after the last one.
 * - **Failure isolation.** The traffic data is the capture; the image is a view of it.
 *   A render that fails leaves the capture `done` with no image, never `failed` — the
 *   zone page and Studio redraw from the stored traffic either way.
 *
 * The image is drawn by Studio's own renderer (via the web app's render page), in the
 * default capture style: the Dark theme, BR-017's congestion colours, the zone name and
 * WIB timestamp (BR-018) and the legend (BR-019), at PLAYWRIGHT_SCREENSHOT_WIDTH ×
 * HEIGHT. The style is stored on the capture as `style_used` (BR-023).
 */

interface RenderJob {
  captureId: string
}

/** The style every automatic capture image is drawn in (BR-018, BR-019, BR-023). */
export function captureImageSpec(): RenderPageJob['spec'] {
  return {
    themeId: 'dark',
    congestionId: 'standard',
    overlay: {
      effect: 'vignette',
      title: '',
      textSize: 'medium',
      text: { x: 0.95, y: 0.84, align: 'right' },
      legend: true, // BR-019: the legend is required on every capture image
      boundary: false,
    },
    view: { zoomOffset: 0, panX: 0, panY: 0 },
    width: config.playwrightScreenshotWidth,
    height: config.playwrightScreenshotHeight,
    holdMs: 1000,
  }
}

/** How long the browser outlives its last image — a capture burst reuses it, a quiet hour doesn't pay for it. */
const BROWSER_IDLE_MS = 60_000

let browser: Browser | null = null
let idleTimer: NodeJS.Timeout | null = null

/** The worker's single browser, launched on first use and relaunched if it died. */
async function sharedBrowser(): Promise<Browser> {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (browser?.isConnected()) return browser
  const launched = await launchBrowser()
  launched.on('disconnected', () => {
    if (browser === launched) browser = null
  })
  browser = launched
  return launched
}

function releaseBrowser(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const b = browser
    browser = null
    idleTimer = null
    void b?.close().catch(() => undefined)
  }, BROWSER_IDLE_MS)
}

export async function renderCaptureImage(captureId: string): Promise<void> {
  const capture = await captureRepo.findById(captureId)
  if (!capture || capture.status !== 'done') return
  if (capture.filePath) return // already rendered — a duplicate delivery
  const zone = await zoneRepo.findById(capture.zoneId)
  if (!zone) return

  const spec = captureImageSpec()
  const { pngs } = await renderWithPage(
    await sharedBrowser(),
    { format: 'png', spec, frameCount: 1, zoneName: zone.name, ring: zone.geometry.coordinates[0] as [number, number][] },
    {
      frame: async () => ({
        capturedAt: capture.capturedAt.toISOString(),
        traffic: capture.traffic ? slimTraffic(capture.traffic) : null,
      }),
    },
    `capture ${captureId}`,
  )
  const png = pngs[0]?.data
  if (!png || png.length === 0) throw new Error('render produced no image')

  const path = capturePath(capture.userId, capture.id, capture.capturedAt, 'png')
  await upload(path, png, 'image/png')
  await captureRepo.setImage(capture.id, path, png.length, spec)
  console.log(`[render] capture ${captureId} image — ${png.length} bytes`)
}

export async function registerRenderConsumer(ch: Channel): Promise<void> {
  if (!isR2Configured()) {
    console.warn('[render] R2 not configured — capture images are not rendered')
    return
  }
  await ch.prefetch(1)
  await ch.consume(config.rabbitmqQueueRender, (msg: ConsumeMessage | null) => {
    if (!msg) return
    void (async () => {
      try {
        const job = JSON.parse(msg.content.toString()) as RenderJob
        if (!job?.captureId) throw new Error('job tanpa captureId')
        await renderCaptureImage(job.captureId)
      } catch (err) {
        // Logged and dropped: the capture itself is already complete and displayable
        // from its traffic. Retrying a render forever would only hold the queue.
        console.error('[render] failed:', err instanceof Error ? err.message : err)
      }
      releaseBrowser()
      ch.ack(msg)
    })()
  })
  console.log(`[worker] consuming ${config.rabbitmqQueueRender} (prefetch 1, one shared browser)`)
}
