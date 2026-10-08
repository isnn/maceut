import { describe, it, expect } from 'vitest'
import { captureErrorForUser, exportErrorForUser } from './user-facing-errors'

describe('exportErrorForUser', () => {
  it.each([
    'page.evaluate: Target crashed ',
    'page.waitForFunction: Timeout 120000ms exceeded.',
    'Render berhenti di tengah jalan. Silakan coba lagi.',
    'Render selesai tanpa menghasilkan file.',
    'net::ERR_ABORTED; maybe frame was detached?',
  ])('says what to do, not what broke: %s', (raw) => {
    const msg = exportErrorForUser(raw)!
    expect(msg).toBe('This export couldn’t be finished. Retry to render it again.')
    expect(msg).not.toMatch(/memory|crash|timeout|page\.|render berhenti/i)
  })

  it('keeps the few that are the user’s own business', () => {
    expect(exportErrorForUser('Dibatalkan.')).toBe('Cancelled.')
    expect(exportErrorForUser('Antrian export tidak tersedia. Coba lagi sebentar lagi.')).toBe('This export couldn’t start. Retry in a moment.')
    expect(exportErrorForUser('Zona sudah dihapus.')).toBe('Its zone was deleted, so it can’t be rendered.')
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

  it('says nothing beyond "Missed" for a missed firing', () => {
    expect(captureErrorForUser('missed', '12 jadwal terlewat — sistem tidak aktif selama 180 menit.')).toBeNull()
    expect(captureErrorForUser('missed', 'Not collected: a later capture of this zone was collected instead.')).toBeNull()
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
