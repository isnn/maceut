import { describe, it, expect, vi } from 'vitest'
import { registerIdleBrowser, withBrowserSlot } from './browser-slot'

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('withBrowserSlot', () => {
  it('never lets two browser jobs run at once, and keeps their order', async () => {
    let running = 0
    let maxRunning = 0
    const order: string[] = []
    const job = (name: string) =>
      withBrowserSlot(async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        order.push(`${name} start`)
        await tick()
        order.push(`${name} end`)
        running--
      })

    await Promise.all([job('export'), job('capture image'), job('capture image 2')])
    expect(maxRunning).toBe(1)
    expect(order).toEqual([
      'export start', 'export end',
      'capture image start', 'capture image end',
      'capture image 2 start', 'capture image 2 end',
    ])
  })

  it('releases the slot even when the job throws', async () => {
    await expect(withBrowserSlot(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(withBrowserSlot(async () => 'next')).resolves.toBe('next')
  })

  it('closes kept-warm browsers when asked, before the job starts', async () => {
    const close = vi.fn(async () => undefined)
    const unregister = registerIdleBrowser(close)
    let closedBeforeJob = false
    await withBrowserSlot(async () => void (closedBeforeJob = close.mock.calls.length === 1), { closeIdle: true })
    expect(closedBeforeJob).toBe(true)
    unregister()
  })
})
