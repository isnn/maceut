import { describe, expect, it } from 'vitest'
import { wibMonth } from './capture-pool'

describe('wibMonth — the monthly pool resets on the 1st at 00:00 WIB', () => {
  it('starts and ends the month on Jakarta’s midnight', () => {
    const m = wibMonth(new Date('2026-10-12T05:00:00Z'))
    expect(m.key).toBe('2026-10')
    expect(m.start.toISOString()).toBe('2026-09-30T17:00:00.000Z')
    expect(m.end.toISOString()).toBe('2026-10-31T17:00:00.000Z')
  })

  it('belongs to the next month from 00:00 WIB, seven hours before UTC turns', () => {
    expect(wibMonth(new Date('2026-10-31T16:59:59Z')).key).toBe('2026-10')
    expect(wibMonth(new Date('2026-10-31T17:00:00Z')).key).toBe('2026-11')
  })

  it('rolls December into January of the next year', () => {
    const m = wibMonth(new Date('2026-12-15T00:00:00Z'))
    expect(m.key).toBe('2026-12')
    expect(m.end.toISOString()).toBe('2026-12-31T17:00:00.000Z')
    expect(wibMonth(m.end).key).toBe('2027-01')
  })

  it('handles February in a leap year', () => {
    expect(wibMonth(new Date('2028-02-20T00:00:00Z')).end.toISOString()).toBe('2028-02-29T17:00:00.000Z')
  })
})
