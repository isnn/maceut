import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('better-auth/node', () => ({ fromNodeHeaders: (h: unknown) => h }))
vi.mock('../repositories/user.repository', () => ({ findByIdWithPlan: vi.fn(), expireToFree: vi.fn() }))
vi.mock('../repositories/plan-change.repository', () => ({ record: vi.fn() }))
vi.mock('../services/plan.service', () => ({ applyPlanChange: vi.fn(async () => ({ zonesToPause: [], schedulesToPause: [] })) }))
vi.mock('../services/notification.service', () => ({ onPlanExpired: vi.fn() }))

import type { Request, Response } from 'express'
import { planCheck } from './auth.middleware'
import * as userRepo from '../repositories/user.repository'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('planCheck', () => {
  it('T24: hands an account whose paid period ended the Free plan, in that same request', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({
      id: 'u1',
      plan: 'premium',
      planExpiresAt: new Date(Date.now() - 1000),
    } as never)
    vi.mocked(userRepo.expireToFree).mockResolvedValue({ plan: 'free' } as never)
    const req = { userId: 'u1' } as Request
    const next = vi.fn()

    await planCheck(req, {} as Response, next)

    expect(req.plan).toBe('free')
    expect(next).toHaveBeenCalledWith()
  })

  it('leaves a running paid period alone', async () => {
    vi.mocked(userRepo.findByIdWithPlan).mockResolvedValue({
      id: 'u1',
      plan: 'premium',
      planExpiresAt: new Date(Date.now() + 86_400_000),
    } as never)
    const req = { userId: 'u1' } as Request
    await planCheck(req, {} as Response, vi.fn())
    expect(req.plan).toBe('premium')
    expect(userRepo.expireToFree).not.toHaveBeenCalled()
  })
})
