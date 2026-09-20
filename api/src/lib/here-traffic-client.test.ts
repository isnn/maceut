import { describe, it, expect } from 'vitest'
import {
  buildFlowUrl,
  redactUrl,
  stateFromJamFactor,
  functionalClassesFor,
  toGeoJson,
  validateBBox,
  TRAFFIC_STATE_COLOR,
  MAX_BBOX_DEGREES,
  type BBox,
} from './here-traffic-client'
import { ValidationError } from '../errors'

/** One HERE result with two shape points, so it maps to a drawable LineString. */
function result(jamFactor: number, opts: { fc?: number; name?: string } = {}) {
  return {
    location: {
      description: opts.name,
      ...(opts.fc !== undefined ? { functionalClass: opts.fc } : {}),
      shape: {
        links: [
          {
            points: [
              { lat: -7.8, lng: 110.36 },
              { lat: -7.79, lng: 110.37 },
            ],
          },
        ],
      },
    },
    currentFlow: { jamFactor },
  }
}

describe('stateFromJamFactor (BR-017)', () => {
  it('maps each band', () => {
    expect(stateFromJamFactor(0)).toBe('normal')
    expect(stateFromJamFactor(3.9)).toBe('normal')
    expect(stateFromJamFactor(4)).toBe('slow')
    expect(stateFromJamFactor(5.9)).toBe('slow')
    expect(stateFromJamFactor(6)).toBe('heavy')
    expect(stateFromJamFactor(7.9)).toBe('heavy')
    expect(stateFromJamFactor(8)).toBe('congested')
    expect(stateFromJamFactor(10)).toBe('congested')
  })

  it('uses the colours the frontend already renders', () => {
    // These literals also live in web/src/lib/constants.ts. If one side changes and
    // the other does not, the preview and the capture disagree on what red means.
    expect(TRAFFIC_STATE_COLOR).toEqual({
      normal: '#4CAF50',
      slow: '#F4A300',
      heavy: '#EF7B21',
      congested: '#EF4444',
    })
  })
})

describe('functionalClassesFor (BR-001..003, BR-022)', () => {
  it('widens with the road class', () => {
    expect(functionalClassesFor('nasional')).toEqual([1, 2])
    expect(functionalClassesFor('nasional_provinsi')).toEqual([1, 2, 3])
    expect(functionalClassesFor('semua')).toEqual([1, 2, 3, 4, 5])
  })
})

describe('validateBBox', () => {
  const ok: BBox = [110.36, -7.8, 110.37, -7.79]

  it('accepts a city-scale box', () => {
    expect(() => validateBBox(ok)).not.toThrow()
  })

  it('rejects inverted coordinates', () => {
    expect(() => validateBBox([110.37, -7.8, 110.36, -7.79])).toThrow(ValidationError)
    expect(() => validateBBox([110.36, -7.79, 110.37, -7.8])).toThrow(ValidationError)
  })

  it('rejects coordinates outside WGS84', () => {
    expect(() => validateBBox([-181, -7.8, 110.37, -7.79])).toThrow(ValidationError)
    expect(() => validateBBox([110.36, -91, 110.37, -7.79])).toThrow(ValidationError)
  })

  it('rejects a box too large to bill or render', () => {
    const huge: BBox = [110, -8, 110 + MAX_BBOX_DEGREES + 0.1, -7.9]
    expect(() => validateBBox(huge)).toThrow(/terlalu luas/)
  })

  it('rejects NaN rather than passing it to HERE', () => {
    expect(() => validateBBox([Number.NaN, -7.8, 110.37, -7.79])).toThrow(ValidationError)
  })
})

describe('buildFlowUrl', () => {
  it('sends functionalClasses to HERE — the only way to filter', () => {
    // The flow response carries no functional class, so a local filter would be a
    // silent no-op and every plan would receive every road class.
    const url = buildFlowUrl([110.36, -7.8, 110.37, -7.79], { functionalClasses: [1, 2] })
    expect(url).toContain('functionalClasses=1%2C2')
    expect(url).toContain('in=bbox%3A110.36%2C-7.8%2C110.37%2C-7.79')
    expect(url).toContain('locationReferencing=shape')
  })

  it('omits the filter when no classes are given', () => {
    expect(buildFlowUrl([110.36, -7.8, 110.37, -7.79])).not.toContain('functionalClasses')
  })

  it('never leaks the key when redacted for logs', () => {
    const url = buildFlowUrl([110.36, -7.8, 110.37, -7.79])
    expect(redactUrl(url)).toContain('apiKey=***')
    expect(redactUrl(url)).not.toMatch(/apiKey=[^*&]/)
  })
})

describe('toGeoJson', () => {
  it('maps a result to a coloured LineString', () => {
    const out = toGeoJson({ results: [result(8.5, { name: 'Jalan Malioboro' })] })

    expect(out.type).toBe('FeatureCollection')
    expect(out.features).toHaveLength(1)
    expect(out.features[0]).toMatchObject({
      type: 'Feature',
      geometry: { type: 'LineString' },
      properties: { trafficState: 'congested', color: '#EF4444', jamFactor: 8.5, name: 'Jalan Malioboro' },
    })
  })

  it('emits [lng, lat], not HERE’s lat/lng order', () => {
    // Getting this backwards puts Yogyakarta in Somalia, and the map renders empty
    // rather than wrong — which is much harder to notice.
    const [first] = toGeoJson({ results: [result(1)] }).features[0]!.geometry.coordinates
    expect(first).toEqual([110.36, -7.8])
  })

  it('skips a result with no jam factor rather than guessing one', () => {
    const out = toGeoJson({ results: [{ location: result(1).location, currentFlow: {} }] })
    expect(out.features).toHaveLength(0)
  })

  it('skips a link with fewer than two points', () => {
    const out = toGeoJson({
      results: [{ location: { shape: { links: [{ points: [{ lat: -7.8, lng: 110.36 }] }] } }, currentFlow: { jamFactor: 2 } }],
    })
    expect(out.features).toHaveLength(0)
  })

  it('handles an empty or absent results array', () => {
    expect(toGeoJson({}).features).toEqual([])
    expect(toGeoJson({ results: [] }).features).toEqual([])
  })

  describe('functional-class filtering', () => {
    // HERE filters upstream; these cover the defensive local pass, which only bites
    // if HERE ever starts returning a class.
    it('keeps only the requested classes', () => {
      const out = toGeoJson(
        { results: [result(1, { fc: 1 }), result(2, { fc: 3 }), result(3, { fc: 5 })] },
        [1, 2, 3],
      )
      expect(out.features.map((f) => f.properties.functionalClass)).toEqual([1, 3])
    })

    it('returns everything when no filter is given', () => {
      const out = toGeoJson({ results: [result(1, { fc: 1 }), result(2, { fc: 5 })] })
      expect(out.features).toHaveLength(2)
    })

    it('keeps segments whose class HERE did not report', () => {
      // This is every segment in practice: HERE's flow response carries no functional
      // class, so filtering happens upstream via the `functionalClasses` parameter.
      // Dropping unknowns here would empty the map entirely.
      const out = toGeoJson({ results: [result(1)] }, [1, 2])
      expect(out.features).toHaveLength(1)
      expect(out.features[0]!.properties.functionalClass).toBeUndefined()
    })
  })
})
