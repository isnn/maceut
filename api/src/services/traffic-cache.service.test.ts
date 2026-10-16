import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./here-usage.service', () => ({ meteredTrafficFlow: vi.fn(async () => ({ type: 'FeatureCollection', features: [] })) }))

import { meteredTrafficFlow } from './here-usage.service'
import { clearTrafficCache, getFlow, snapBBox } from './traffic-cache.service'

beforeEach(() => {
  vi.clearAllMocks()
  clearTrafficCache()
})

describe('traffic cache', () => {
  it('widens a box outward to the 0.005° grid', () => {
    expect(snapBBox([110.3612, -7.8013, 110.3741, -7.7902])).toEqual([110.36, -7.805, 110.375, -7.79])
  })

  it('serves two boxes ~100 m apart from one HERE call', async () => {
    await getFlow('preview', [110.3612, -7.8013, 110.3741, -7.7902], 'semua')
    await getFlow('preview', [110.3605, -7.8004, 110.3735, -7.7909], 'semua')
    expect(meteredTrafficFlow).toHaveBeenCalledTimes(1)
    expect(vi.mocked(meteredTrafficFlow).mock.calls[0]![1]).toEqual([110.36, -7.805, 110.375, -7.79])
  })
})
