/**
 * Studio playback, over the captures a zone has actually collected.
 *
 * This file used to generate its own traffic: a Gaussian morning peak, a softer evening
 * one, a flat overnight base. It read convincingly and was entirely invented — the
 * scrubber moved through a curve that had never touched a road. Every frame here now
 * comes from a real cycle.
 *
 * Frames are listed without their geometry and fetched one at a time as the player
 * reaches them. A capture is about 2 MB, so a twenty-frame day would be 40 MB up front;
 * the slim projection is ~575 KB and only the frames actually played are ever loaded.
 */

import * as zonesApi from '@/features/zones/api'
import { apiClient } from '@/lib/api-client'

/** The zone-detail page's Captures stepper fetches the same shape (`?slim=1`). */
export type { SlimTraffic } from '@/features/zones/api'

export interface Frame {
  id: string
  zoneId: string
  /** "HH:mm" in Asia/Jakarta. */
  time: string
  capturedAt: string
  /** Mean jam factor, 0–10. Null when the cycle collected nothing. */
  jamFactorAvg: number | null
  roadsCount: number | null
}

/** "HH:mm" in Jakarta, which is the clock every capture window is written against. */
function wibClock(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
    .format(new Date(iso))
    .replace('.', ':')
}

/**
 * A filename-safe stamp of an instant in Jakarta time, "YYYY-MM-DD-HH-mm".
 *
 * WIB, not UTC: every image's caption shows WIB, so a file named from the UTC clock
 * (`toISOString()`) read seven hours off its own picture — a 06:00 capture was saved as
 * "…-23-00", and after 17:00 WIB under the previous day's date.
 */
export function wibStamp(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  // en-CA can report midnight as "24"; the calendar date already rolled over.
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}-${hour}-${get('minute')}`
}

/** The Jakarta calendar date of an instant, as "YYYY-MM-DD". */
export function wibDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}

/**
 * Every playable frame inside the plan's history, oldest first, and how many days that
 * history covers (null = all). The server applies the limit (BR-007), so the timeframe
 * can only offer what the plan keeps.
 *
 * Only `done` cycles: a frame that failed or was missed has no traffic to draw, and
 * silently including it would make the player stall on a blank map with no explanation.
 * The Captures table on the zone page is where those are accounted for.
 */
export async function getFrames(zoneId: string): Promise<{ frames: Frame[]; historyDays: number | null }> {
  const res = await apiClient.get<{
    frames: { id: string; capturedAt: string; jamFactorAvg: number | null; roadsCount: number | null }[]
    historyDays: number | null
  }>(`/zones/${zoneId}/frames`)
  return {
    historyDays: res.historyDays,
    frames: res.frames.map((f) => ({ ...f, zoneId, time: wibClock(f.capturedAt) })),
  }
}


/** The days this zone has frames for, newest day first. */
export function daysWithFrames(frames: Frame[]): string[] {
  return [...new Set(frames.map((f) => wibDate(f.capturedAt)))].sort().reverse()
}

/** One frame's geometry. Cached by the caller — the same frame is replayed constantly. */
export const getFrameTraffic = zonesApi.getCaptureTrafficSlim
