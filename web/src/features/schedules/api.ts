// TODO: replace with real fetch through @/lib/api-client once api/ exists
// (GET/POST/PATCH/DELETE /schedules, POST /schedules/:id/pause|resume).

import { ApiError } from '@/types/api'
import { PLAN_LIMITS } from '@/lib/constants'
import { generateId } from '@/lib/utils'
import type { Plan } from '@/features/auth/types'
import * as zonesApi from '@/features/zones/api'
import { framesPerDay, type CaptureWindow, type CreateWindowInput } from './types'

const WINDOWS_KEY = 'maceut_mock_windows'
const SEEDED_KEY = 'maceut_mock_windows_seeded'
const MOCK_LATENCY_MS = 350
const WEEKDAYS = [0, 1, 2, 3, 4]

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

function readWindows(): CaptureWindow[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(WINDOWS_KEY)
  return raw ? (JSON.parse(raw) as CaptureWindow[]) : []
}

function writeWindows(windows: CaptureWindow[]) {
  window.localStorage.setItem(WINDOWS_KEY, JSON.stringify(windows))
}

/** Gives the seeded demo zones the windows the Schedule mockup shows. */
async function seedIfEmpty(plan: Plan) {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(SEEDED_KEY)) return
  window.localStorage.setItem(SEEDED_KEY, '1')
  if (readWindows().length > 0) return

  const zones = await zonesApi.getZones(plan)
  const collecting = zones.filter((z) => z.status === 'collecting')
  const seeded: CaptureWindow[] = []
  if (collecting[0]) {
    seeded.push(
      makeWindow(collecting[0].id, 'Puncak pagi', '06:00', '11:00', 'hourly', WEEKDAYS, 412),
      makeWindow(collecting[0].id, 'Puncak sore', '16:00', '21:00', 'hourly', WEEKDAYS, 388)
    )
  }
  if (collecting[1]) {
    seeded.push(makeWindow(collecting[1].id, 'Sepanjang hari', '07:00', '15:00', 'hourly', WEEKDAYS, 264))
  }
  writeWindows(seeded)
}

function makeWindow(
  zoneId: string,
  label: string,
  start: string,
  end: string,
  interval: CaptureWindow['interval'],
  days: number[],
  capturedFrames: number
): CaptureWindow {
  return {
    id: generateId(),
    zoneId,
    label,
    start,
    end,
    interval,
    days,
    active: true,
    capturedFrames,
    createdAt: '2026-07-22T02:00:00.000Z',
  }
}

export async function getWindows(plan: Plan = 'standard'): Promise<CaptureWindow[]> {
  await seedIfEmpty(plan)
  return delay(readWindows())
}

export async function createWindow(input: CreateWindowInput, plan: Plan): Promise<CaptureWindow> {
  const windows = readWindows()
  const activeCount = windows.filter((w) => w.active).length
  if (activeCount >= PLAN_LIMITS[plan].schedulesLimit) {
    await delay(null)
    throw new ApiError({
      code: 'SCHEDULE_LIMIT_EXCEEDED',
      message: `Batas ${PLAN_LIMITS[plan].schedulesLimit} jendela aktif untuk paket Anda sudah tercapai.`,
    })
  }
  if (input.interval === '15min' && plan !== 'premium') {
    await delay(null)
    throw new ApiError({ code: 'FORBIDDEN', message: 'Interval 15 menit hanya tersedia di paket Premium.' })
  }
  const created: CaptureWindow = {
    id: generateId(),
    zoneId: input.zoneId,
    label: input.label || 'Jendela baru',
    start: input.start,
    end: input.end,
    interval: input.interval,
    days: input.days,
    active: true,
    capturedFrames: 0,
    createdAt: new Date().toISOString(),
  }
  writeWindows([...windows, created])
  return delay(created)
}

export async function updateWindow(id: string, patch: Partial<CaptureWindow>): Promise<CaptureWindow> {
  const windows = readWindows()
  const found = windows.find((w) => w.id === id)
  if (!found) {
    await delay(null)
    throw new ApiError({ code: 'NOT_FOUND', message: 'Jendela tidak ditemukan.' })
  }
  const updated = { ...found, ...patch }
  writeWindows(windows.map((w) => (w.id === id ? updated : w)))
  return delay(updated)
}

export async function deleteWindow(id: string): Promise<void> {
  writeWindows(readWindows().filter((w) => w.id !== id))
  await delay(null)
}

/** Total frames per day across active windows — the Schedule budget readout. */
export function totalFramesPerDay(windows: CaptureWindow[]): number {
  return windows.filter((w) => w.active).reduce((sum, w) => sum + framesPerDay(w), 0)
}
