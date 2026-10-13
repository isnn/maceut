import { describe, it, expect, vi } from 'vitest'
import { searchHere, searchOsm } from './geocoder'

const json = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('searchHere', () => {
  it('searches worldwide and maps the view box', async () => {
    const f = json({
      items: [{ title: 'Malioboro', position: { lat: -7.79, lng: 110.36 }, mapView: { west: 1, south: 2, east: 3, north: 4 }, address: { countryCode: 'IDN' } }],
    })
    const r = await searchHere('Malioboro', 'key', f)
    expect(r).toEqual([{ label: 'Malioboro', lat: -7.79, lng: 110.36, bbox: [1, 2, 3, 4], countryCode: 'id' }])
    const url = new URL((f.mock.calls[0] as unknown as [string])[0])
    // Worldwide: no country filter (Indonesia is ranked first by the service).
    expect(url.searchParams.get('in')).toBeNull()
    expect(url.searchParams.get('apiKey')).toBe('key')
  })

  it('throws on an HTTP error', async () => {
    await expect(searchHere('x', 'key', json({}, 429))).rejects.toThrow('[here] HTTP 429')
  })
})

describe('searchOsm', () => {
  it('reorders Nominatim boxes to west, south, east, north and identifies itself', async () => {
    const f = json([
      { display_name: 'Tugu', lat: '-7.78', lon: '110.36', boundingbox: ['-7.79', '-7.77', '110.35', '110.37'], address: { country_code: 'id' } },
    ])
    const r = await searchOsm('Tugu', f)
    expect(r).toEqual([{ label: 'Tugu', lat: -7.78, lng: 110.36, bbox: [110.35, -7.79, 110.37, -7.77], countryCode: 'id' }])
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).searchParams.get('countrycodes')).toBeNull()
    expect(new URL(url).searchParams.get('bounded')).toBe('0')
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('Maceut')
  })
})
