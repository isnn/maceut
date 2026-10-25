import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

const config = vi.hoisted(() => ({ demoEnabled: true, demoEmail: 'demo@hokya.dev' }))
vi.mock('../config/env', () => ({ config }))
vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {} }))
vi.mock('../repositories/user.repository', () => ({ findById: vi.fn() }))

import * as userRepo from '../repositories/user.repository'
import { demoGuard } from './demo.middleware'
import { DemoAccountLockedError } from '../errors'

const run = async (userId?: string) => {
  const next = vi.fn()
  await demoGuard({ userId } as Request, {} as Response, next)
  return next.mock.calls[0]?.[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  config.demoEnabled = true
})

describe('demoGuard', () => {
  it('answers 403 DEMO_ACCOUNT_LOCKED for the demo account', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue({ id: 'd', email: 'demo@hokya.dev' } as never)
    const err = await run('d')
    expect(err).toBeInstanceOf(DemoAccountLockedError)
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('DEMO_ACCOUNT_LOCKED')
  })

  it('passes every other account', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue({ id: 'u', email: 'someone@hokya.dev' } as never)
    expect(await run('u')).toBeUndefined()
  })

  it('does not even look the account up while DEMO_ENABLED is off', async () => {
    config.demoEnabled = false
    expect(await run('d')).toBeUndefined()
    expect(userRepo.findById).not.toHaveBeenCalled()
  })
})
