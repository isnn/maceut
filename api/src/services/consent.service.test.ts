import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { consentProblem, consentStamp } from './consent.service'
import { LEGAL_VERSION } from '../types/legal'

describe('consent at sign-up (H4)', () => {
  it('refuses a sign-up without the box ticked', () => {
    expect(consentProblem({ email: 'a@b.co', password: 'x', name: 'A' })).toMatch(/Accept the Terms/)
    expect(consentProblem({ acceptTerms: 'true', consentVersion: LEGAL_VERSION })).toMatch(/Accept the Terms/)
    expect(consentProblem(undefined)).toMatch(/Accept the Terms/)
  })

  it('refuses consent to an older version of the texts', () => {
    expect(consentProblem({ acceptTerms: true, consentVersion: '2020-01-01' })).toMatch(/changed/)
    expect(consentProblem({ acceptTerms: true })).toMatch(/changed/)
  })

  it('accepts the current version', () => {
    expect(consentProblem({ acceptTerms: true, consentVersion: LEGAL_VERSION })).toBeNull()
  })

  it('stamps the time and the version', () => {
    const now = new Date('2026-10-12T10:00:00Z')
    expect(consentStamp(now)).toEqual({ termsAcceptedAt: now, termsVersion: LEGAL_VERSION })
  })
})

const WEB_TEXTS = resolve(__dirname, '../../../web/src/features/legal/texts.ts')

describe.skipIf(!existsSync(WEB_TEXTS))('the form and the server agree on the version', () => {
  it('LEGAL_VERSION is the same in api and web', async () => {
    const web = await import(WEB_TEXTS)
    expect(web.LEGAL_VERSION).toBe(LEGAL_VERSION)
  })
})
