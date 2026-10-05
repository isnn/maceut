import { describe, it, expect } from 'vitest'
import { captureErrorForUser, exportErrorForUser } from './user-facing-errors'

describe('exportErrorForUser', () => {
  it('never shows the renderer’s own words', () => {
    const msg = exportErrorForUser('page.evaluate: Target crashed ')
    expect(msg).toBe('The render ran out of memory partway through. Try again — a smaller size or fewer frames makes it lighter.')
    expect(msg).not.toMatch(/page\.evaluate|Target/)
  })

  it.each([
    ['page.waitForFunction: Timeout 120000ms exceeded.', 'Rendering took too long and was stopped. Please try again.'],
    ['Render berhenti di tengah jalan. Silakan coba lagi.', 'Rendering stopped unexpectedly. Please try again.'],
    ['Antrian export tidak tersedia. Coba lagi sebentar lagi.', 'The export queue was busy. Please try again in a moment.'],
    ['Dibatalkan.', 'Cancelled.'],
    ['net::ERR_ABORTED; maybe frame was detached?', 'Something went wrong while rendering. Please try again.'],
  ])('%s', (raw, expected) => {
    expect(exportErrorForUser(raw)).toBe(expected)
  })

  it('passes "no error" through', () => {
    expect(exportErrorForUser(null)).toBeNull()
  })
})

describe('captureErrorForUser', () => {
  it('names the daily limit in English', () => {
    expect(captureErrorForUser('skipped_limit', 'Batas 50 capture per hari sudah tercapai.')).toBe(
      'Skipped — the daily limit of 50 captures was reached.',
    )
  })

  it('explains a missed firing, with or without a count', () => {
    expect(captureErrorForUser('missed', '12 jadwal terlewat — sistem tidak aktif selama 180 menit.')).toBe(
      '12 scheduled captures were missed while Maceut was unavailable for 180 min.',
    )
    expect(captureErrorForUser('missed', 'Jadwal terlewat — sistem tidak aktif selama 20 menit.')).toBe(
      'This scheduled capture was missed while Maceut was unavailable for 20 min.',
    )
  })

  it('turns a HERE outage into what it means', () => {
    expect(captureErrorForUser('failed', 'Data lalu lintas sedang tidak tersedia. Coba lagi nanti.')).toBe(
      'Traffic data wasn’t available at this moment. The next scheduled time tries again.',
    )
    expect(captureErrorForUser('failed', 'HERE responded 503')).toMatch(/Traffic data wasn’t available/)
  })

  it('has a plain fallback for anything else', () => {
    expect(captureErrorForUser('failed', 'TypeError: cannot read properties of undefined')).toBe(
      'This capture couldn’t be collected. The next scheduled time tries again.',
    )
  })
})
