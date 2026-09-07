import type { Plan } from '@/features/auth/types'

/**
 * Plan catalog — single source of truth for the frontend.
 *
 * `schedulesLimit` and `capturesLimit` carry BR-005 / BR-006 (10/20/50 active
 * schedules, 10/50/100 daily captures). The remaining fields come from the
 * turn 3/4 mockups (zone slots, seats, capture interval, retention, export
 * formats), which price Standard at Rp 490rb and Premium at Rp 1,9jt.
 */
export const PLAN_LIMITS = {
  free: {
    maxRoadClass: 'nasional',
    schedulesLimit: 10,
    capturesLimit: 10,
    zonesLimit: 1,
    seatsLimit: 1,
    storageGb: 1,
    captureInterval: 'Daily',
    historyLabel: '7 days',
    exportLabel: 'Images only',
  },
  standard: {
    maxRoadClass: 'nasional_provinsi',
    schedulesLimit: 20,
    capturesLimit: 50,
    zonesLimit: 5,
    seatsLimit: 5,
    storageGb: 10,
    captureInterval: 'Hourly',
    historyLabel: '90 days',
    exportLabel: 'GIF + MP4',
  },
  premium: {
    maxRoadClass: 'semua',
    schedulesLimit: 50,
    capturesLimit: 100,
    zonesLimit: 25,
    seatsLimit: 25,
    storageGb: 100,
    captureInterval: '15 minutes',
    historyLabel: 'Unlimited',
    exportLabel: 'All formats + API',
  },
} as const

export const PLAN_ORDER: Plan[] = ['free', 'standard', 'premium']

export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Free',
  standard: 'Standard',
  premium: 'Premium',
}

export const PLAN_PRICE: Record<Plan, { amount: string; period: string }> = {
  free: { amount: 'Rp 0', period: '/ month' },
  standard: { amount: 'Rp 490k', period: '/ month' },
  premium: { amount: 'Rp 1.9m', period: '/ month' },
}

/** Bullet list shown on plan cards (landing, sign up, onboarding). */
export const PLAN_HIGHLIGHTS: Record<Plan, string[]> = {
  free: ['1 zone · 10 captures / day', 'Nasional road class', '7-day frame history', 'Images only, no animation export'],
  standard: [
    '5 zones · 50 captures / day',
    'Nasional + Provinsi road classes',
    '90-day history · CSV export',
    'GIF + MP4 animation export',
  ],
  premium: [
    '25 zones · 100 captures / day',
    'Adds Kota / Lokal road classes',
    'Unlimited history · 15-minute interval',
    'API access · SSO · SLA',
  ],
}

export const ROAD_CLASS_LABEL: Record<string, string> = {
  nasional: 'Nasional',
  nasional_provinsi: 'Nasional + Provinsi',
  semua: 'All roads',
}

export const ROAD_CLASS_REQUIRED_PLAN: Record<string, string> = {
  nasional: 'free',
  nasional_provinsi: 'standard',
  semua: 'premium',
}

export const TRAFFIC_COLORS: Record<string, string> = {
  normal: '#4CAF50',
  slow: '#F4A300',
  heavy: '#EF7B21',
  congested: '#EF4444',
}

export const CAPTURE_POLL_INTERVAL_MS = 3000
