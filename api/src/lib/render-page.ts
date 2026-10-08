import { chromium, type Browser } from 'playwright-core'
import { config } from '../config/env'
import type { SlimTraffic } from '../services/capture.service'

/**
 * Drives the web app's `/render/export` page in headless Chromium — the one place the
 * server draws images. Studio exports (export.worker) and per-capture images
 * (render.worker) both go through here, and the page itself runs Studio's own
 * `renderCapture` / `recordAnimation`, so every server-made image is exactly what the
 * preview shows.
 *
 * The page holds no data: it asks for each frame through `__exportFrame`, reports
 * progress through `__exportProgress` (whose answer can stop it), and hands its output
 * back through `__exportPng` — Playwright's exposeFunction, in-process.
 */

/** What the render page is handed. Mirrors web/src/app/render/export/page.tsx. */
export interface RenderPageJob {
  /**
   * `png`: one capture's image (+ thumbnail). `zip`: a run of export frames as PNGs —
   * for every export format; videos are encoded from them by ffmpeg (EXP-B).
   */
  format: 'png' | 'zip'
  spec: {
    themeId: string
    congestionId: string
    overlay: unknown
    view: unknown
    width: number
    height: number
    holdMs: number
    /** Frame encoding (EXP-C). PNG unless a ZIP asked for WebP. */
    imageFormat?: 'png' | 'webp'
  }
  frameCount: number
  /** First frame to render — after a browser crash, the export resumes here. */
  startFrame?: number
  /** Stop before this frame (exclusive). Frames past it come from elsewhere (reuse). */
  endFrame?: number
  zoneName: string
  ring: [number, number][]
}

/** What the page measured for one frame (EXP-A1 Step 0: where the time goes). */
export interface FrameStats {
  drawMs: number
  encodeMs: number
}

export interface RenderFrame {
  capturedAt: string
  traffic: SlimTraffic | null
}

export interface RenderBridge {
  frame: (i: number) => Promise<RenderFrame>
  /** Called as frames finish. Resolve false to stop the render (a cancelled export). */
  progress?: (done: number) => Promise<boolean> | boolean
  /**
   * Receives each PNG as soon as it's encoded. When given, PNGs are streamed to it and
   * NOT collected in `RenderOutput.pngs` — an export's memory stays at one frame. The
   * page waits for this to resolve before drawing the next frame (backpressure).
   */
  png?: (i: number, name: string, data: Buffer, stats: FrameStats | null) => Promise<void>
}

export interface RenderOutput {
  pngs: { name: string; data: Buffer }[]
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: config.playwrightChromiumExecutablePath ?? '/usr/bin/chromium',
    headless: config.playwrightHeadless,
    // --no-sandbox: the container runs as root and has no user namespaces for the
    // sandbox. --disable-dev-shm-usage: Docker's default /dev/shm is 64 MB, too small
    // for a 1920px canvas, and Chromium crashes rather than degrading when it runs out.
    //
    // The rest keep one renderer lean on a small host (EXP-A2): no GPU process (it
    // renders in software anyway), a single renderer process, no extensions or audio,
    // and `gc()` exposed so the page frees each frame's memory before drawing the next.
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--renderer-process-limit=1',
      '--disable-extensions',
      '--mute-audio',
      '--js-flags=--expose-gc',
    ],
  })
}

/**
 * How long a render may go without any sign of life before it is abandoned. Every
 * frame request, progress report and finished image resets it, so a long export that
 * keeps drawing is never cut off; only a page that has stopped answering is.
 *
 * The case it exists for (2026-10-08): the web app restarted while a capture image was
 * being drawn, the page never reported back, and `page.evaluate` waited forever. The
 * job never acked, RabbitMQ closed the worker's channel at its 30-minute limit, and
 * every queue stopped with it. A normal frame takes seconds; a cold Next compile of the
 * render page is covered by the 120 s limits on loading it.
 */
export const RENDER_STALL_MS = 3 * 60_000

export class RenderStalledError extends Error {
  constructor(label: string, ms: number) {
    super(`Render ${label} stalled: no progress for ${Math.round(ms / 1000)} s.`)
    this.name = 'RenderStalledError'
  }
}

/**
 * Renders one job in a fresh page of `browser`, and closes the page. Rejects with
 * `RenderStalledError` if the page goes `stallMs` without progress; the caller should
 * then treat the browser as suspect and close it.
 */
export async function renderWithPage(
  browser: Browser,
  job: RenderPageJob,
  bridge: RenderBridge,
  label: string,
  stallMs: number = RENDER_STALL_MS,
): Promise<RenderOutput> {
  let timer: NodeJS.Timeout | undefined
  let rejectStall!: (err: Error) => void
  const stalled = new Promise<never>((_, reject) => (rejectStall = reject))
  // Never left unhandled: the race below is its only reader, and it may already be over.
  stalled.catch(() => undefined)
  const alive = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => rejectStall(new RenderStalledError(label, stallMs)), stallMs)
  }
  alive()

  const page = await Promise.race([browser.newPage(), stalled])
  try {
    page.on('pageerror', (err) => console.error(`[render] ${label} page error:`, err.message))

    const pngs: { name: string; data: Buffer }[] = []
    await page.exposeFunction('__exportFrame', (i: number) => {
      alive()
      return bridge.frame(i)
    })
    await page.exposeFunction('__exportProgress', async (done: number) => {
      alive()
      return bridge.progress ? bridge.progress(done) : true
    })
    await page.exposeFunction('__exportPng', async (i: number, name: string, base64: string, stats?: FrameStats) => {
      alive()
      const data = Buffer.from(base64, 'base64')
      if (bridge.png) await bridge.png(i, name, data, stats ?? null)
      else pngs[i] = { name, data }
    })

    await page.goto(`${config.renderBaseUrl}/render/export`, { waitUntil: 'load', timeout: 120_000 })
    // The page announces itself once its script has run — in dev, Next compiles the
    // route on first request, which can take far longer than `load`.
    await page.waitForFunction(() => typeof (globalThis as { __maceutExport?: unknown }).__maceutExport === 'function', null, {
      timeout: 120_000,
    })
    alive()
    // `evaluate` has no timeout of its own: without the race, a page that stops
    // answering holds this job, and the browser slot, forever.
    await Promise.race([
      page.evaluate(
        (j) => (globalThis as unknown as { __maceutExport: (job: unknown) => Promise<void> }).__maceutExport(j),
        job,
      ),
      stalled,
    ])
    return { pngs: pngs.filter(Boolean) }
  } finally {
    clearTimeout(timer)
    // A frozen renderer can hang `close` too; the caller closes the browser after a stall.
    await Promise.race([page.close().catch(() => undefined), new Promise((r) => setTimeout(r, 5_000).unref())])
  }
}
