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
  '15min': '15 minutes',
  hourly: 'Hourly',
  daily: 'Daily',
}

/** Frames a window yields per day — drives the "frame per hari" budget. */
export const INTERVAL_PER_HOUR: Record<CaptureInterval, number> = {
  '15min': 4,
  hourly: 1,
  daily: 0,
}

export const DAY_LABEL = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
export const DAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function framesPerDay(window: Pick<CaptureWindow, 'start' | 'end' | 'interval'>): number {
  if (window.interval === 'daily') return 1

  // Must match api/src/types/schedule.ts exactly: this number is shown against the
  // plan's daily budget, and if the two disagree the UI promises a budget the server
  // does not enforce.
  //
  // It previously read only the HOUR digits, so 07:30–09:00 counted as two full hours
  // and any window inside a single hour counted as zero — the second of which made
  // short windows look free against BR-006.
  const [sh = 0, sm = 0] = window.start.split(':').map(Number)
  const [eh = 0, em = 0] = window.end.split(':').map(Number)
  const minutes = eh * 60 + em - (sh * 60 + sm)

  const step = window.interval === '15min' ? 15 : 60
  return Math.max(Math.ceil(minutes / step), 0)
}
