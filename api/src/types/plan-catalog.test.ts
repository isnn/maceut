import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLANS, PLAN_LIMITS, isUpgrade, planRank, isRoadClassAllowed } from './plan'
import { PLAN_MIN_INTERVAL } from './schedule'

/**
 * The four-plan catalog (delivery doc F3/F4). The backend enforces these numbers and the
 * frontend shows them, so the two copies are compared field for field. The web copy is
 * only on disk in a full checkout: the api container mounts api/ alone, so there the
 * comparison is skipped rather than failed.
 */

const WEB_CONSTANTS = resolve(__dirname, '../../../web/src/lib/constants.ts')
const WEB_PLAN_FIT = resolve(__dirname, '../../../web/src/features/schedules/plan-fit.ts')

describe('plan catalog', () => {
  it('orders the plans cheapest to dearest', () => {
    expect(PLANS).toEqual(['free', 'starter', 'standard', 'premium'])
  })

  it('ranks every pair of plans consistently', () => {
    for (const from of PLANS) {
      for (const to of PLANS) {
        expect(isUpgrade(from, to)).toBe(planRank(to) > planRank(from))
      }
    }
    expect(isUpgrade('free', 'starter')).toBe(true)
    expect(isUpgrade('starter', 'standard')).toBe(true)
    expect(isUpgrade('standard', 'starter')).toBe(false)
  })

  it('carries the delivery-doc numbers', () => {
    expect(PLAN_LIMITS.starter).toEqual({
      maxRoadClass: 'nasional_provinsi',
      schedulesLimit: 9,
      monthlyCaptures: 450,
      zonesLimit: 3,
      seatsLimit: 1,
      storageGb: 5,
      exportFramesLimit: 120,
      exportBudgetMpFrames: 250,
      historyDays: 30,
      exportRetentionDays: 14,
    })
    expect(PLANS.map((p) => PLAN_LIMITS[p].zonesLimit)).toEqual([1, 3, 10, 15])
    expect(PLANS.map((p) => PLAN_LIMITS[p].schedulesLimit)).toEqual([3, 9, 30, 45])
    expect(PLANS.map((p) => PLAN_LIMITS[p].seatsLimit)).toEqual([1, 1, 5, 5])
    expect(PLANS.map((p) => PLAN_LIMITS[p].monthlyCaptures)).toEqual([45, 450, 2000, 3000])
    expect(PLANS.map((p) => PLAN_LIMITS[p].historyDays)).toEqual([7, 30, 30, 30])
    expect(PLANS.map((p) => PLAN_LIMITS[p].exportRetentionDays)).toEqual([7, 14, 30, 30])
  })

  it('keeps history to 30 days at most on every plan (HERE terms)', () => {
    for (const p of PLANS) {
      const days = PLAN_LIMITS[p].historyDays
      expect(days).not.toBeNull()
      expect(days!).toBeLessThanOrEqual(30)
    }
  })

  it('gives Starter hourly captures and main roads, but not 15 minutes or all roads', () => {
    expect(PLAN_MIN_INTERVAL.starter).toEqual(['daily', 'hourly'])
    expect(PLAN_MIN_INTERVAL.standard).not.toContain('15min')
    expect(isRoadClassAllowed('starter', 'nasional_provinsi')).toBe(true)
    expect(isRoadClassAllowed('starter', 'semua')).toBe(false)
  })

  it.skipIf(!existsSync(WEB_CONSTANTS))('matches the frontend copy field for field', async () => {
    const web = await import(WEB_CONSTANTS)
    expect(web.PLAN_ORDER).toEqual([...PLANS])
    for (const p of PLANS) {
      const { captureInterval, historyLabel, exportLabel, ...shared } = web.PLAN_LIMITS[p]
      void captureInterval
      void historyLabel
      void exportLabel
      expect(shared, p).toEqual(PLAN_LIMITS[p])
    }
  })

  it.skipIf(!existsSync(WEB_PLAN_FIT))('matches the frontend intervals', async () => {
    const fit = await import(WEB_PLAN_FIT).catch(() => null)
    // plan-fit imports through the web app's `@/` alias; when that cannot resolve here,
    // compare the source text instead.
    if (fit) {
      expect(fit.PLAN_INTERVALS).toEqual(PLAN_MIN_INTERVAL)
      return
    }
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(WEB_PLAN_FIT, 'utf8')
    for (const p of PLANS) {
      const list = PLAN_MIN_INTERVAL[p].map((i) => `'${i}'`).join(', ')
      expect(src, p).toContain(`${p}: [${list}]`)
    }
  })
})
