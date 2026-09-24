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
 * Every playable frame a zone has, oldest first.
 *
 * Only `done` cycles: a frame that failed or was missed has no traffic to draw, and
 * silently including it would make the player stall on a blank map with no explanation.
 * The Captures table on the zone page is where those are accounted for.
 *
 * Oldest first because playback runs forward through time, unlike every other list in
 * the app, which shows newest first.
 */
export async function getFrames(zoneId: string): Promise<Frame[]> {
  // 100 is the endpoint's ceiling, and it is the right ceiling: a day of 15-minute
  // captures inside a working window is well under that, and asking for more was a 422
  // the player surfaced as "Input tidak valid" with no clue where it came from.
  const captures = await zonesApi.getZoneCaptures(zoneId, 100)

  return captures
    .filter((c) => c.status === 'done')
    .map((c) => ({
      id: c.id,
      zoneId: c.zoneId,
      time: wibClock(c.capturedAt),
      capturedAt: c.capturedAt,
      jamFactorAvg: c.jamFactorAvg,
      roadsCount: c.roadsCount,
    }))
    .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1))
}

/** The days this zone has frames for, newest day first. */
export function daysWithFrames(frames: Frame[]): string[] {
  return [...new Set(frames.map((f) => wibDate(f.capturedAt)))].sort().reverse()
}

/** One frame's geometry. Cached by the caller — the same frame is replayed constantly. */
export const getFrameTraffic = zonesApi.getCaptureTrafficSlim
