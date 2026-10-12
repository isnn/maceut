import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../lib/rabbitmq-client', () => ({ publishExportJob: vi.fn() }))
vi.mock('../repositories/user.repository', () => ({ findByIdWithPlan: vi.fn() }))

import * as userRepo from '../repositories/user.repository'
import { expiryForOwner, expiryFrom } from './export.service'
import { MAX_EXPORT_RETENTION_DAYS, PLANS, PLAN_LIMITS } from '../types/plan'

const DAY = 86_400_000
const NOW = new Date('2026-10-12T05:00:00Z')

beforeEach(() => vi.clearAllMocks())

describe('export expiry per plan (PKG-F9)', () => {
  it.each([
    ['free', 7],
    ['starter', 14],
    ['standard', 30],
    ['premium', 30],
  ] as const)('keeps a %s export for %i days', (plan, days) => {
    expect(expiryFrom(NOW, plan).getTime() - NOW.getTime()).toBe(days * DAY)
  })

  it('never keeps an export past 30 days on any plan', () => {
    expect(MAX_EXPORT_RETENTION_DAYS).toBe(30)
    for (const plan of PLANS) {
      expect(PLAN_LIMITS[plan].exportRetentionDays).toBeLessThanOrEqual(MAX_EXPORT_RETENTION_DAYS)
    }
  })

  it("reads the owner's plan at the moment the export finishes", async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({ id: 'u1', plan: 'starter' } as never)
    expect(await expiryForOwner('u1', NOW)).toEqual(new Date(NOW.getTime() + 14 * DAY))
  })

  it('falls back to the Free period when the account has no plan row', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue(undefined)
    expect(await expiryForOwner('gone', NOW)).toEqual(new Date(NOW.getTime() + 7 * DAY))
  })
})
