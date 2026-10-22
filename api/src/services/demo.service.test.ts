import { describe, it, expect, vi, beforeEach } from 'vitest'

const config = vi.hoisted(() => ({
  demoEnabled: true,
  demoEmail: 'demo@hokya.dev',
  demoPassword: 'demo1234',
  demoSourceZoneId: 'src-zone' as string | undefined,
}))
const r2Ready = vi.hoisted(() => ({ on: true }))

vi.mock('../config/env', () => ({ config, isR2Configured: () => r2Ready.on }))
vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../lib/r2-client', () => ({
  remove: vi.fn(async () => undefined),
  download: vi.fn(async () => Buffer.from('png')),
  upload: vi.fn(async () => undefined),
  thumbnailPath: (p: string) => p.replace(/\.png$/, '.thumb.jpg'),
  capturePath: (u: string, id: string) => `captures/${u}/2026/10/${id}.png`,
}))
vi.mock('../repositories/user.repository', () => ({
  findByEmail: vi.fn(),
  deleteById: vi.fn(async () => undefined),
  updateUser: vi.fn(async () => undefined),
}))
vi.mock('../repositories/zone.repository', () => ({ findById: vi.fn(), create: vi.fn(async () => ({ id: 'demo-zone' })) }))
vi.mock('../repositories/capture.repository', () => ({
  filePathsForUser: vi.fn(async () => ['captures/old/a.png']),
  latestDoneWibDayBefore: vi.fn(async () => '2026-10-21'),
  listDoneOnWibDay: vi.fn(async () => [
    { id: 's1', capturedAt: new Date('2026-10-21T01:00:00Z'), filePath: 'captures/src/s1.png', fileSize: 10 },
    { id: 's2', capturedAt: new Date('2026-10-21T01:15:00Z'), filePath: null, fileSize: null },
  ]),
  copyInto: vi.fn(async (id: string) => `new-${id}`),
  setImage: vi.fn(async () => undefined),
}))
vi.mock('../repositories/export.repository', () => ({ filePathsForUser: vi.fn(async () => ['exports/old/x.zip']) }))
vi.mock('../repositories/render-cache.repository', () => ({ pathsForUser: vi.fn(async () => []) }))
vi.mock('./auto-renew.service', () => ({ stopQuietly: vi.fn(async () => undefined) }))
vi.mock('./user.service', () => ({ createUser: vi.fn(async () => ({ user: { id: 'demo-new' } })) }))

import * as r2 from '../lib/r2-client'
import * as userRepo from '../repositories/user.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as captureRepo from '../repositories/capture.repository'
import * as userService from './user.service'
import * as autoRenew from './auto-renew.service'
import { resetDemoAccount } from './demo.service'

const NOW = new Date('2026-10-22T00:01:00+07:00')
const SOURCE = { id: 'src-zone', name: 'YOG', geometry: { type: 'Polygon', coordinates: [] }, roadClass: 'all', roadsCount: 5, lengthKm: 2 }

beforeEach(() => {
  vi.clearAllMocks()
  config.demoSourceZoneId = 'src-zone'
  r2Ready.on = true
  vi.mocked(userRepo.findByEmail).mockResolvedValue({ id: 'demo-old', email: 'demo@hokya.dev' } as never)
  vi.mocked(zoneRepo.findById).mockResolvedValue(SOURCE as never)
})

describe('resetDemoAccount', () => {
  it("removes the old account's files, then the account, before creating it again", async () => {
    const r = await resetDemoAccount(NOW)
    expect(vi.mocked(r2.remove).mock.calls.map((c) => c[0])).toEqual([
      'captures/old/a.png',
      'captures/old/a.thumb.jpg',
      'exports/old/x.zip',
    ])
    expect(autoRenew.stopQuietly).toHaveBeenCalledWith('demo-old')
    expect(userRepo.deleteById).toHaveBeenCalledWith('demo-old')
    expect(vi.mocked(userRepo.deleteById).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(userService.createUser).mock.invocationCallOrder[0]!,
    )
    expect(r).toMatchObject({ userId: 'demo-new', replaced: true, filesRemoved: 3 })
  })

  it('creates it as Premium, with the configured password, and verified', async () => {
    await resetDemoAccount(NOW)
    expect(userService.createUser).toHaveBeenCalledWith({
      email: 'demo@hokya.dev',
      password: 'demo1234',
      fullName: 'Demo',
      plan: 'premium',
      role: 'user',
    })
    expect(userRepo.updateUser).toHaveBeenCalledWith('demo-new', { emailVerified: true })
  })

  it("seeds a copy of the source zone with its latest complete day, copying images to the demo's own path", async () => {
    const r = await resetDemoAccount(NOW)
    expect(zoneRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'demo-new', name: 'YOG', roadClass: 'all' }))
    expect(captureRepo.latestDoneWibDayBefore).toHaveBeenCalledWith('src-zone', NOW)
    expect(captureRepo.copyInto).toHaveBeenCalledTimes(2)
    expect(captureRepo.copyInto).toHaveBeenCalledWith('s1', { userId: 'demo-new', zoneId: 'demo-zone' })
    expect(r2.upload).toHaveBeenCalledWith('captures/demo-new/2026/10/new-s1.png', expect.any(Buffer), 'image/png')
    expect(captureRepo.setImage).toHaveBeenCalledTimes(1)
    expect(captureRepo.setImage).toHaveBeenCalledWith('new-s1', 'captures/demo-new/2026/10/new-s1.png', 3, undefined)
    expect(r).toMatchObject({ seededCaptures: 2, sampleDay: '2026-10-21' })
  })

  it('creates the first account without deleting anything', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(undefined)
    const r = await resetDemoAccount(NOW)
    expect(userRepo.deleteById).not.toHaveBeenCalled()
    expect(r2.remove).not.toHaveBeenCalled()
    expect(r.replaced).toBe(false)
  })

  it('with no source zone set, creates the account and nothing else', async () => {
    config.demoSourceZoneId = undefined
    const r = await resetDemoAccount(NOW)
    expect(zoneRepo.create).not.toHaveBeenCalled()
    expect(captureRepo.copyInto).not.toHaveBeenCalled()
    expect(r).toMatchObject({ seededCaptures: 0, sampleDay: null })
  })

  it('without R2, copies the captures but no images', async () => {
    r2Ready.on = false
    const r = await resetDemoAccount(NOW)
    expect(r2.upload).not.toHaveBeenCalled()
    expect(captureRepo.setImage).not.toHaveBeenCalled()
    expect(r.seededCaptures).toBe(2)
  })
})
