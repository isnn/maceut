/**
 * Place search for the zone map: HERE Geocoding first, OpenStreetMap Nominatim as the
 * backup (geocode.service picks which). Plain fetch, one GET each; no SDK.
 */

export interface PlaceResult {
  label: string
  lat: number
  lng: number
  /** [west, south, east, north], so the map can fit the whole place. Null for a point. */
  bbox: [number, number, number, number] | null
  /** Lower case; Indonesia is always `id` (HERE's other codes stay alpha-3, e.g. `jpn`). Null if unknown. */
  countryCode: string | null
}

export type GeocodeProvider = 'here' | 'osm'

const HERE_URL = 'https://geocode.search.hereapi.com/v1/geocode'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
/** Nominatim's policy asks for an identifying User-Agent with a contact. */
const USER_AGENT = 'Maceut/1.0 (support.maceut@hokya.dev)'
/** Asked of each provider; the service ranks Indonesia first and keeps the top 5. */
const LIMIT = 8
/** Indonesia's box for Nominatim, as a preference (`bounded=0`), not a filter. */
const INDONESIA_VIEWBOX = '95,6,141,-11'

export class GeocodeError extends Error {
  constructor(
    readonly provider: GeocodeProvider,
    message: string,
  ) {
    super(`[${provider}] ${message}`)
    this.name = 'GeocodeError'
  }
}

interface HereItem {
  title: string
  position: { lat: number; lng: number }
  mapView?: { west: number; south: number; east: number; north: number }
  address?: { countryCode?: string }
}

/**
 * HERE gives alpha-3; only "is it Indonesia" matters downstream, so map that one and keep the rest.
 * No `at` hint is sent: one at Indonesia's centre pulled "Malioboro" to Balikpapan ahead of
 * Yogyakarta. Worldwide relevance plus rankIndonesiaFirst ranks better.
 */
const alpha2 = (code: string | undefined) => (!code ? null : code.toUpperCase() === 'IDN' ? 'id' : code.toLowerCase())

export async function searchHere(q: string, apiKey: string, doFetch: typeof fetch = fetch): Promise<PlaceResult[]> {
  const url = `${HERE_URL}?${new URLSearchParams({ q, limit: String(LIMIT), lang: 'id-ID', apiKey })}`
  let res: Response
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(8000) })
  } catch (err) {
    throw new GeocodeError('here', `unreachable: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) throw new GeocodeError('here', `HTTP ${res.status}`)
  const body = (await res.json()) as { items?: HereItem[] }
  return (body.items ?? []).map((i) => ({
    label: i.title,
    lat: i.position.lat,
    lng: i.position.lng,
    bbox: i.mapView ? [i.mapView.west, i.mapView.south, i.mapView.east, i.mapView.north] : null,
    countryCode: alpha2(i.address?.countryCode),
  }))
}

interface NominatimItem {
  display_name: string
  lat: string
  lon: string
  /** [south, north, west, east], as strings. */
  boundingbox?: [string, string, string, string]
  address?: { country_code?: string }
}

export async function searchOsm(q: string, doFetch: typeof fetch = fetch): Promise<PlaceResult[]> {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({ q,
    format: 'jsonv2',
    limit: String(LIMIT),
    viewbox: INDONESIA_VIEWBOX,
    bounded: '0',
    addressdetails: '1',
    'accept-language': 'id' })}`
  let res: Response
  try {
    res = await doFetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) })
  } catch (err) {
    throw new GeocodeError('osm', `unreachable: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) throw new GeocodeError('osm', `HTTP ${res.status}`)
  const body = (await res.json()) as NominatimItem[]
  return body.map((i) => {
    const [s, n, w, e] = (i.boundingbox ?? []).map(Number)
    return {
      label: i.display_name,
      lat: Number(i.lat),
      lng: Number(i.lon),
      bbox: i.boundingbox ? [w!, s!, e!, n!] : null,
      countryCode: i.address?.country_code?.toLowerCase() ?? null,
    }
  })
}
