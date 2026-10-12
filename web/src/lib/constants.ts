import type { Plan } from '@/features/auth/types'

/**
 * Plan catalog — single source of truth for the frontend.
 *
 * The four-plan catalog from the delivery doc (2026-10). Mirrors PLAN_LIMITS in
 * api/src/types/plan.ts field for field; api/src/types/plan-catalog.test.ts fails when
 * the two drift. `monthlyCaptures` is the monthly capture pool (BR-006, delivery doc
 * F5): captures per WIB calendar month, shared by every zone and window.
 */
export const PLAN_LIMITS = {
  free: {
    maxRoadClass: 'nasional',
    schedulesLimit: 3,
    monthlyCaptures: 45,
    zonesLimit: 1,
    seatsLimit: 1,
    storageGb: 1,
    captureInterval: 'Daily',
    /** How far back the captures CSV reaches, in days; null = all (FE-30). */
    historyDays: 7,
    historyLabel: '7 days',
    /** Frames per export, and frames × pixels (megapixel-frames) per export — EXP-C. */
    exportFramesLimit: 60,
    exportBudgetMpFrames: 120,
    /** Days a finished export stays downloadable (PKG-F9). */
    exportRetentionDays: 7,
    exportLabel: 'Images only',
  },
  starter: {
    maxRoadClass: 'nasional_provinsi',
    schedulesLimit: 9,
    monthlyCaptures: 450,
    zonesLimit: 3,
    seatsLimit: 1,
    storageGb: 5,
    captureInterval: 'Hourly',
    /** How far back the captures CSV reaches, in days; null = all (FE-30). */
    historyDays: 30,
    historyLabel: '30 days',
    /** Frames per export, and frames × pixels (megapixel-frames) per export — EXP-C. */
    exportFramesLimit: 120,
    exportBudgetMpFrames: 250,
    /** Days a finished export stays downloadable (PKG-F9). */
    exportRetentionDays: 14,
    exportLabel: 'GIF + MP4',
  },
  standard: {
    maxRoadClass: 'nasional_provinsi',
    schedulesLimit: 30,
    monthlyCaptures: 2000,
    zonesLimit: 10,
    seatsLimit: 5,
    storageGb: 10,
    captureInterval: 'Hourly',
    /** How far back the captures CSV reaches, in days; null = all (FE-30). */
    historyDays: 30,
    historyLabel: '30 days',
    /** Frames per export, and frames × pixels (megapixel-frames) per export — EXP-C. */
    exportFramesLimit: 240,
    exportBudgetMpFrames: 500,
    /** Days a finished export stays downloadable (PKG-F9). */
    exportRetentionDays: 30,
    exportLabel: 'GIF + MP4',
  },
  premium: {
    maxRoadClass: 'semua',
    schedulesLimit: 45,
    monthlyCaptures: 3000,
    zonesLimit: 15,
    seatsLimit: 5,
    storageGb: 100,
    captureInterval: '15 minutes',
    /** How far back the captures CSV reaches, in days; null = all (FE-30). */
    historyDays: 30,
    historyLabel: '30 days',
    /** Frames per export, and frames × pixels (megapixel-frames) per export — EXP-C. */
    exportFramesLimit: 720,
    exportBudgetMpFrames: 2900,
    /** Days a finished export stays downloadable (PKG-F9). */
    exportRetentionDays: 30,
    exportLabel: 'All formats + API',
  },
} as const

export const PLAN_ORDER: Plan[] = ['free', 'starter', 'standard', 'premium']

export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Free',
  starter: 'Starter',
  standard: 'Standard',
  premium: 'Premium',
}

export const PLAN_PRICE: Record<Plan, { amount: string; period: string }> = {
  free: { amount: 'Rp 0', period: '/ month' },
  starter: { amount: 'Rp 99k', period: '/ month' },
  standard: { amount: 'Rp 349k', period: '/ month' },
  premium: { amount: 'Rp 1.49m', period: '/ month' },
}

/** Bullet list shown on plan cards (landing, sign up, onboarding). */
export const PLAN_HIGHLIGHTS: Record<Plan, string[]> = {
  // Facts only (FE-36): every line comes from PLAN_LIMITS / the API's plan rules. Every
  // plan exports ZIP, WebM and MP4, so export formats are not listed as a tier difference.
  free: ['1 zone', '45 captures a month', 'Highways', 'One capture a day per window', '7 days of history in CSV', 'Exports kept 7 days'],
  starter: ['3 zones', '450 captures a month', 'Highways + main roads', 'Hourly captures', '30 days of history in CSV', 'Exports kept 14 days'],
  standard: ['10 zones', '2,000 captures a month', 'Highways + main roads', 'Hourly captures', '30 days of history in CSV', 'Exports kept 30 days'],
  premium: ['15 zones', '3,000 captures a month', 'All roads, down to local streets', 'Captures every 15 minutes', '30 days of history in CSV', 'Exports kept 30 days'],
}

/**
 * Road classes as people see them (FE-33) — described by the road, not by Indonesia's
 * administrative tiers, so they read the same anywhere. The ids stay `nasional` /
 * `nasional_provinsi` / `semua`: they are the DB enum and the API contract.
 */
export const ROAD_CLASS_LABEL: Record<string, string> = {
  nasional: 'Highways',
  nasional_provinsi: 'Highways + main roads',
  semua: 'All roads',
}

export const ROAD_CLASS_REQUIRED_PLAN: Record<string, string> = {
  nasional: 'free',
  nasional_provinsi: 'starter',
  semua: 'premium',
}

export const TRAFFIC_COLORS: Record<string, string> = {
  normal: '#4CAF50',
  slow: '#F4A300',
  heavy: '#EF7B21',
  congested: '#EF4444',
}

export const CAPTURE_POLL_INTERVAL_MS = 3000
