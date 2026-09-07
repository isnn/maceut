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
    captureInterval: 'Harian',
    historyLabel: '7 hari',
    exportLabel: 'Gambar saja',
  },
  standard: {
    maxRoadClass: 'nasional_provinsi',
    schedulesLimit: 20,
    capturesLimit: 50,
    zonesLimit: 5,
    seatsLimit: 5,
    storageGb: 10,
    captureInterval: 'Per jam',
    historyLabel: '90 hari',
    exportLabel: 'GIF + MP4',
  },
  premium: {
    maxRoadClass: 'semua',
    schedulesLimit: 50,
    capturesLimit: 100,
    zonesLimit: 25,
    seatsLimit: 25,
    storageGb: 100,
    captureInterval: '15 menit',
    historyLabel: 'Tanpa batas',
    exportLabel: 'Semua format + API',
  },
} as const

export const PLAN_ORDER: Plan[] = ['free', 'standard', 'premium']

export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Free',
  standard: 'Standard',
  premium: 'Premium',
}

export const PLAN_PRICE: Record<Plan, { amount: string; period: string }> = {
  free: { amount: 'Rp 0', period: '/ bulan' },
  standard: { amount: 'Rp 490rb', period: '/ bulan' },
  premium: { amount: 'Rp 1,9jt', period: '/ bulan' },
}

/** Bullet list shown on plan cards (landing, sign up, onboarding). */
export const PLAN_HIGHLIGHTS: Record<Plan, string[]> = {
  free: [
    '1 zona · 10 capture / hari',
    'Kelas jalan Nasional',
    'Riwayat 7 hari',
    'Gambar saja, tanpa ekspor animasi',
  ],
  standard: [
    '5 zona · 50 capture / hari',
    'Kelas jalan Nasional + Provinsi',
    'Riwayat 90 hari · ekspor CSV',
    'Ekspor animasi GIF + MP4',
  ],
  premium: [
    '25 zona · 100 capture / hari',
    'Tambahan kelas Kota / Lokal',
    'Riwayat tanpa batas · interval 15 menit',
    'Akses API · SSO · SLA',
  ],
}

export const ROAD_CLASS_LABEL: Record<string, string> = {
  nasional: 'Nasional',
  nasional_provinsi: 'Nasional + Provinsi',
  semua: 'Semua Jalan',
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
