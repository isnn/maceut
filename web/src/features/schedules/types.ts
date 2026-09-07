export type CaptureInterval = '15min' | 'hourly' | 'daily'

/** One collection window on the Schedule board (3j). */
export interface CaptureWindow {
  id: string
  zoneId: string
  label: string
  /** "HH:mm" in Asia/Jakarta. */
  start: string
  end: string
  interval: CaptureInterval
  /** 0 = Monday … 6 = Sunday. */
  days: number[]
  active: boolean
  /** Frames already collected by this window, shown when editing (3l). */
  capturedFrames: number
  createdAt: string
}

export interface CreateWindowInput {
  zoneId: string
  label: string
  start: string
  end: string
  interval: CaptureInterval
  days: number[]
}

export const INTERVAL_LABEL: Record<CaptureInterval, string> = {
  '15min': '15 menit',
  hourly: 'Per jam',
  daily: 'Harian',
}

/** Frames a window yields per day — drives the "frame per hari" budget. */
export const INTERVAL_PER_HOUR: Record<CaptureInterval, number> = {
  '15min': 4,
  hourly: 1,
  daily: 0,
}

export const DAY_LABEL = ['S', 'S', 'R', 'K', 'J', 'S', 'M']
export const DAY_NAME = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

export function framesPerDay(window: Pick<CaptureWindow, 'start' | 'end' | 'interval'>): number {
  if (window.interval === 'daily') return 1
  const [startH] = window.start.split(':').map(Number)
  const [endH] = window.end.split(':').map(Number)
  const hours = Math.max(endH - startH, 0)
  return hours * INTERVAL_PER_HOUR[window.interval]
}
