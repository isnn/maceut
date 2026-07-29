// TODO: replace with real fetch through @/lib/api-client once api/ + worker exist
// (POST /captures/manual, GET /captures/:id, GET /captures). The status
// progression (pending -> processing -> done) is simulated client-side here
// to stand in for the RabbitMQ + Playwright worker pipeline.

import { ApiError } from '@/types/api'
import type { CaptureStyleInput } from '@/features/zones/types'
import type { Capture } from './types'

const CAPTURES_KEY = 'maceut_mock_captures'
const MAX_DAILY_CAPTURES = 100

function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function readCaptures(): Capture[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(CAPTURES_KEY)
  return raw ? (JSON.parse(raw) as Capture[]) : []
}

function writeCaptures(captures: Capture[]) {
  window.localStorage.setItem(CAPTURES_KEY, JSON.stringify(captures))
}

function updateCapture(id: string, patch: Partial<Capture>) {
  const captures = readCaptures()
  const next = captures.map((c) => (c.id === id ? { ...c, ...patch } : c))
  writeCaptures(next)
}

function countToday(): number {
  const startOfDayWIB = new Date()
  startOfDayWIB.setUTCHours(-7, 0, 0, 0) // WIB = UTC+7, so UTC midnight WIB is 17:00 previous day UTC
  return readCaptures().filter((c) => new Date(c.createdAt) >= startOfDayWIB).length
}

function runMockPipeline(captureId: string) {
  setTimeout(() => updateCapture(captureId, { status: 'processing' }), 1200)
  setTimeout(() => {
    updateCapture(captureId, {
      status: 'done',
      filePath: '/mock-capture-placeholder.svg',
      fileSize: 245_760,
      completedAt: new Date().toISOString(),
    })
  }, 3000)
}

export async function triggerManual(zoneId: string, style: CaptureStyleInput): Promise<Capture> {
  if (countToday() >= MAX_DAILY_CAPTURES) {
    await delay(null)
    throw new ApiError({ code: 'PLAN_LIMIT_EXCEEDED', message: 'Anda telah mencapai batas 100 captures hari ini.' })
  }

  const capture: Capture = {
    id: crypto.randomUUID(),
    zoneId,
    status: 'pending',
    filePath: null,
    fileSize: null,
    errorMessage: null,
    styleUsed: style,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }
  writeCaptures([...readCaptures(), capture])
  runMockPipeline(capture.id)
  return delay(capture, 200)
}

export async function getCapture(id: string): Promise<Capture> {
  const capture = readCaptures().find((c) => c.id === id)
  if (!capture) {
    await delay(null)
    throw new ApiError({ code: 'NOT_FOUND', message: 'Capture tidak ditemukan.' })
  }
  return delay(capture, 150)
}

export async function countTodayCaptures(): Promise<number> {
  return delay(countToday(), 100)
}
