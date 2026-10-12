import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLANS, PLAN_LIMITS } from './plan'

/**
 * The Terms (H2) state plan numbers in prose: history and export expiry in §6. The text
 * is the owner's verbatim draft, so it is never generated from the catalog; this test
 * fails instead when the two disagree, and the fix is a conversation, not a silent edit.
 * Skipped where web/ is not mounted (the api container).
 */
const WEB_TEXTS = resolve(__dirname, '../../../web/src/features/legal/texts.ts')
const LABEL = { free: 'Free', starter: 'Starter', standard: 'Standard', premium: 'Premium' } as const

describe.skipIf(!existsSync(WEB_TEXTS))('Terms §6 against the plan catalog', () => {
  const history = PLANS.map((p) => PLAN_LIMITS[p].historyDays ?? 0)
  const exports = PLANS.map((p) => `${LABEL[p]} ${PLAN_LIMITS[p].exportRetentionDays}`).join(', ')

  it.each(['en', 'id'] as const)('%s: export expiry per plan matches exportRetentionDays', async (lang) => {
    const { TERMS } = await import(WEB_TEXTS)
    expect(TERMS[lang]).toContain(exports)
  })

  it('EN: the history range matches historyDays', async () => {
    const { TERMS } = await import(WEB_TEXTS)
    expect(TERMS.en).toContain(`going back ${Math.min(...history)} to ${Math.max(...history)} days`)
  })

  it('ID: the history range matches historyDays', async () => {
    const { TERMS } = await import(WEB_TEXTS)
    expect(TERMS.id).toContain(`${Math.min(...history)} hingga ${Math.max(...history)} hari`)
  })
})
