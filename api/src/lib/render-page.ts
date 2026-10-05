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

/** Renders one job in a fresh page of `browser`, and closes the page. */
export async function renderWithPage(browser: Browser, job: RenderPageJob, bridge: RenderBridge, label: string): Promise<RenderOutput> {
  const page = await browser.newPage()
  try {
    page.on('pageerror', (err) => console.error(`[render] ${label} page error:`, err.message))

    const pngs: { name: string; data: Buffer }[] = []
    await page.exposeFunction('__exportFrame', (i: number) => bridge.frame(i))
    await page.exposeFunction('__exportProgress', async (done: number) => (bridge.progress ? bridge.progress(done) : true))
    await page.exposeFunction('__exportPng', async (i: number, name: string, base64: string, stats?: FrameStats) => {
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
    await page.evaluate(
      (j) => (globalThis as unknown as { __maceutExport: (job: unknown) => Promise<void> }).__maceutExport(j),
      job,
    )
    return { pngs: pngs.filter(Boolean) }
  } finally {
    await page.close().catch(() => undefined)
  }
}
