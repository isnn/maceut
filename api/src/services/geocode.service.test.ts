import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../repositories/here-usage.repository', () => ({
  GEOCODE_SOURCE: 'geocode',
  geocodeRequestsSince: vi.fn(),
  increment: vi.fn(async () => undefined),
}))

import * as usageRepo from '../repositories/here-usage.repository'
import { clearGeocodeCache, rankIndonesiaFirst, searchPlaces } from './geocode.service'
import { GeocodeError, type PlaceResult } from '../lib/geocoder'

const place: PlaceResult = { label: 'Malioboro, Yogyakarta', lat: -7.79, lng: 110.36, bbox: [110.35, -7.8, 110.37, -7.78], countryCode: 'id' }
const now = () => new Date('2026-10-13T05:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  clearGeocodeCache()
  vi.mocked(usageRepo.geocodeRequestsSince).mockResolvedValue(10)
})

describe('searchPlaces', () => {
  it('uses HERE under the monthly limit and counts the call as geocode', async () => {
    const here = vi.fn(async () => [place])
    const osm = vi.fn()
    const r = await searchPlaces('Malioboro', { here, osm, now, apiKey: 'k', monthlyLimit: 4000 })
    expect(r).toEqual({ provider: 'here', results: [place] })
    expect(osm).not.toHaveBeenCalled()
    expect(usageRepo.increment).toHaveBeenCalledWith('2026-10-13', 'geocode', { requests: 1 })
    expect(usageRepo.geocodeRequestsSince).toHaveBeenCalledWith('2026-10-01')
  })

  it('moves to OpenStreetMap once the month reaches the limit', async () => {
    vi.mocked(usageRepo.geocodeRequestsSince).mockResolvedValue(4000)
    const here = vi.fn()
    const osm = vi.fn(async () => [place])
    const r = await searchPlaces('Malioboro', { here, osm, now, apiKey: 'k', monthlyLimit: 4000 })
    expect(r.provider).toBe('osm')
    expect(here).not.toHaveBeenCalled()
    expect(usageRepo.increment).not.toHaveBeenCalled()
  })

  it('falls back to OpenStreetMap when HERE fails, and records the failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const here = vi.fn(async () => {
      throw new GeocodeError('here', 'HTTP 429')
    })
    const osm = vi.fn(async () => [place])
    const r = await searchPlaces('Tugu', { here, osm, now, apiKey: 'k', monthlyLimit: 4000 })
    expect(r.provider).toBe('osm')
    expect(usageRepo.increment).toHaveBeenCalledWith('2026-10-13', 'geocode', { requests: 1, failed: 1 })
    warn.mockRestore()
  })

  it('uses OpenStreetMap without a HERE key', async () => {
    const osm = vi.fn(async () => [place])
    expect((await searchPlaces('Tugu', { here: vi.fn(), osm, now, apiKey: undefined, monthlyLimit: 4000 })).provider).toBe('osm')
  })

  it('answers a repeated search from the cache', async () => {
    const here = vi.fn(async () => [place])
    const deps = { here, osm: vi.fn(), now, apiKey: 'k', monthlyLimit: 4000 }
    await searchPlaces('Malioboro', deps)
    await searchPlaces('  malioboro ', deps)
    expect(here).toHaveBeenCalledTimes(1)
  })

  it('fails with UPSTREAM_ERROR when both providers fail', async () => {
    const osm = vi.fn(async () => {
      throw new GeocodeError('osm', 'HTTP 503')
    })
    await expect(searchPlaces('Tugu', { here: vi.fn(), osm, now, apiKey: undefined, monthlyLimit: 4000 })).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    })
  })
})

describe('rankIndonesiaFirst', () => {
  it('puts Indonesian places ahead of foreign ones and keeps five', () => {
    const at = (label: string, countryCode: string | null): PlaceResult => ({ ...place, label, countryCode })
    const ranked = rankIndonesiaFirst([at('Tokyo', 'jp'), at('Jakarta', 'id'), at('Osaka', 'jp'), at('Bandung', 'id'), at('?', null), at('Kyoto', 'jp')])
    expect(ranked.map((r) => r.label)).toEqual(['Jakarta', 'Bandung', 'Tokyo', 'Osaka', '?'])
  })
})
