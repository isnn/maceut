import { config } from '../config/env'
import { GeocodeError, searchHere, searchOsm, type GeocodeProvider, type PlaceResult } from '../lib/geocoder'
import * as usageRepo from '../repositories/here-usage.repository'
import { UpstreamError } from '../errors'
import { wibDay, wibMonthStart } from './here-usage.service'

/**
 * Place search on the zone map (owner, 2026-10-13): HERE while this WIB month has sent
 * fewer than HERE_GEOCODE_MONTHLY_LIMIT searches (4,000 of HERE's 5,000 free), then
 * OpenStreetMap Nominatim. HERE failing, or no key, also falls to Nominatim. HERE
 * searches are counted under their own source, apart from the Traffic cap.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_MAX = 500
const cache = new Map<string, { at: number; value: SearchResult }>()

/** Nominatim's usage policy: at most one request a second, from the whole service. */
const OSM_GAP_MS = 1100
let osmChain: Promise<unknown> = Promise.resolve()
let osmLast = 0

export interface SearchResult {
  provider: GeocodeProvider
  results: PlaceResult[]
}

export interface GeocodeDeps {
  here: typeof searchHere
  osm: typeof searchOsm
  now: () => Date
  apiKey: string | undefined
  monthlyLimit: number
}

const defaults = (): GeocodeDeps => ({
  here: searchHere,
  osm: searchOsm,
  now: () => new Date(),
  apiKey: config.hereApiKey,
  monthlyLimit: config.hereGeocodeMonthlyLimit,
})

function throttledOsm(q: string, osm: typeof searchOsm): Promise<PlaceResult[]> {
  const run = osmChain.then(async () => {
    const wait = osmLast + OSM_GAP_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    osmLast = Date.now()
    return osm(q)
  })
  osmChain = run.catch(() => undefined)
  return run
}

export async function searchPlaces(query: string, deps: Partial<GeocodeDeps> = {}): Promise<SearchResult> {
  const d = { ...defaults(), ...deps }
  const q = query.trim().replace(/\s+/g, ' ')
  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  const now = d.now()
  let value: SearchResult | null = null
  if (d.apiKey) {
    const used = await usageRepo.geocodeRequestsSince(wibMonthStart(now)).catch(() => d.monthlyLimit)
    if (used < d.monthlyLimit) {
      try {
        const results = await d.here(q, d.apiKey)
        await usageRepo.increment(wibDay(now), usageRepo.GEOCODE_SOURCE, { requests: 1 }).catch(() => undefined)
        value = { provider: 'here', results }
      } catch (err) {
        await usageRepo.increment(wibDay(now), usageRepo.GEOCODE_SOURCE, { requests: 1, failed: 1 }).catch(() => undefined)
        console.warn('[geocode] HERE failed, using OpenStreetMap:', err instanceof Error ? err.message : err)
      }
    }
  }
  if (!value) {
    try {
      value = { provider: 'osm', results: await throttledOsm(q, d.osm) }
    } catch (err) {
      throw new UpstreamError('Place search', err instanceof GeocodeError ? err.message : 'unavailable')
    }
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), value })
  return value
}

/** Tests only. */
export function clearGeocodeCache(): void {
  cache.clear()
}
