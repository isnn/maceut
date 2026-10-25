import { describe, it, expect, vi, beforeEach } from 'vitest'

const internalEmails: string[] = []
vi.mock('../config/env', () => ({ config: { get internalEmails() { return internalEmails } } }))

import { isInternalByConfig, resolveRole } from './internal-access'

beforeEach(() => {
  internalEmails.length = 0
})

describe('isInternalByConfig', () => {
  it('matches regardless of case or surrounding whitespace', () => {
    internalEmails.push('ops@maceut.id')
    expect(isInternalByConfig('ops@maceut.id')).toBe(true)
    expect(isInternalByConfig('OPS@Maceut.ID')).toBe(true)
    expect(isInternalByConfig('  ops@maceut.id  ')).toBe(true)
  })

  it('is false for an unlisted address, and for an empty list', () => {
    expect(isInternalByConfig('budi@dishub.go.id')).toBe(false)
    internalEmails.push('ops@maceut.id')
    expect(isInternalByConfig('budi@dishub.go.id')).toBe(false)
  })
})

describe('resolveRole — config is a floor, not a ceiling', () => {
  it('promotes a listed address whatever the database says', () => {
    internalEmails.push('ops@maceut.id')
    expect(resolveRole('ops@maceut.id', 'user')).toBe('internal')
  })

  it('leaves a database promotion alone for an unlisted address', () => {
    // The regression this file exists for. Demoting here would make the promote path
    // in changeRole dead code: a role granted through /internal/users would be
    // stripped again on the very next read, and the UI would show it reverting.
    expect(resolveRole('budi@dishub.go.id', 'internal')).toBe('internal')
  })

  it('leaves an ordinary account ordinary', () => {
    expect(resolveRole('budi@dishub.go.id', 'user')).toBe('user')
  })

  it('does not revoke on config removal alone — that takes a demotion too', () => {
    // Documented consequence, asserted so it cannot be mistaken for a bug later.
    expect(resolveRole('ex-staff@maceut.id', 'internal')).toBe('internal')
  })
})
