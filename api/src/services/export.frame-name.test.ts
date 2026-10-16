import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))

import { frameFileName } from './export.service'

/** The render page's naming (web/src/features/studio/api.ts `wibStamp`), copied verbatim. */
function pageName(i: number, iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${String(i + 1).padStart(3, '0')}-${get('year')}-${get('month')}-${get('day')}-${hour}-${get('minute')}.png`
}

describe('frameFileName', () => {
  it('names a reused frame exactly as the render page names a drawn one', () => {
    for (const [i, iso] of [
      [0, '2026-09-28T07:45:00Z'], // 14:45 WIB
      [9, '2026-09-28T17:00:00Z'], // 00:00 WIB the next day
      [119, '2026-12-31T16:59:00Z'], // 23:59 WIB on New Year's Eve
    ] as const) {
      expect(frameFileName(i, new Date(iso))).toBe(pageName(i, iso))
    }
    expect(frameFileName(0, new Date('2026-09-28T07:45:00Z'))).toBe('001-2026-09-28-14-45.png')
  })
})
