export const PLAN_LIMITS = {
  free: { maxRoadClass: 'nasional', schedulesLimit: 10, capturesLimit: 10 },
  standard: { maxRoadClass: 'nasional_provinsi', schedulesLimit: 20, capturesLimit: 50 },
  premium: { maxRoadClass: 'semua', schedulesLimit: 50, capturesLimit: 100 },
} as const

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
