import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Browser } from 'playwright-core'
import { renderWithPage, RenderStalledError, type RenderBridge } from './render-page'

/**
 * A stand-in for a Playwright page. `evaluate` runs `script`, which can call the
 * functions the renderer exposed, the way the real render page does.
 */
function fakeBrowser(script: (fns: Record<string, (...a: unknown[]) => Promise<unknown>>) => Promise<void>) {
  const fns: Record<string, (...a: unknown[]) => Promise<unknown>> = {}
  const page = {
    on: vi.fn(),
    exposeFunction: vi.fn(async (name: string, fn: (...a: unknown[]) => Promise<unknown>) => {
      fns[name] = fn
    }),
    goto: vi.fn(async () => undefined),
    waitForFunction: vi.fn(async () => undefined),
    evaluate: vi.fn(() => script(fns)),
    close: vi.fn(async () => undefined),
  }
  return { browser: { newPage: vi.fn(async () => page) } as unknown as Browser, page }
}

const job = {
  format: 'png' as const,
  spec: { themeId: 'dark', congestionId: 'standard', overlay: {}, view: {}, width: 10, height: 10, holdMs: 0 },
  frameCount: 1,
  zoneName: 'Zone',
  ring: [] as [number, number][],
}
const bridge: RenderBridge = { frame: async () => ({ capturedAt: '2026-10-08T00:00:00Z', traffic: null }) }

afterEach(() => vi.useRealTimers())

describe('renderWithPage stall limit', () => {
  it('gives up on a page that never answers, and closes it', async () => {
    vi.useFakeTimers()
    const { browser, page } = fakeBrowser(() => new Promise(() => undefined)) // the 2026-10-08 hang

    const run = renderWithPage(browser, job, bridge, 'capture x', 1_000)
    const settled = expect(run).rejects.toBeInstanceOf(RenderStalledError)
    await vi.advanceTimersByTimeAsync(1_001)
    await settled
    expect(page.close).toHaveBeenCalled()
  })

  it('never cuts off a long render that keeps reporting progress', async () => {
    vi.useFakeTimers()
    const { browser } = fakeBrowser(async (fns) => {
      // Ten frames, each 600 ms apart: 6 s in all, against a 1 s stall limit.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 600))
        await fns.__exportProgress!(i + 1)
      }
      await fns.__exportPng!(0, 'frame.png', Buffer.from('png').toString('base64'))
    })

    const run = renderWithPage(browser, job, bridge, 'export y', 1_000)
    await vi.advanceTimersByTimeAsync(6_100)
    const out = await run
    expect(out.pngs).toHaveLength(1)
  })
})
