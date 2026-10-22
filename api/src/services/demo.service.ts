/**
 * The shared demo account (DEMO_ENABLED), rebuilt from nothing every day at 00:00 WIB
 * by `demo.sweeper`.
 *
 * Deleted and created again rather than tidied: whatever visitors made during the day —
 * zones, schedules, exports, renamed things — goes with the row through ON DELETE
 * CASCADE, and with it every session, so the next visitor starts from the same place.
 * Its files in R2 are not covered by the cascade, so they are removed first.
 *
 * The fresh account is Premium and verified, and holds one sample zone: a copy of
 * DEMO_SOURCE_ZONE_ID with that zone's latest complete WIB day of captures, so Studio
 * and the history have something to show the moment someone signs in.
 */
import { config, isR2Configured } from '../config/env'
import * as r2 from '../lib/r2-client'
import * as userRepo from '../repositories/user.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as captureRepo from '../repositories/capture.repository'
import * as exportRepo from '../repositories/export.repository'
import * as renderCacheRepo from '../repositories/render-cache.repository'
import * as autoRenew from './auto-renew.service'
import * as userService from './user.service'

export interface DemoResetResult {
  userId: string
  /** The previous demo account was found and deleted. */
  replaced: boolean
  filesRemoved: number
  seededCaptures: number
  /** The WIB day the sample captures come from, or null when nothing was seeded. */
  sampleDay: string | null
}

/** Removes a file and, for a capture image, its thumbnail. Best-effort: a failure is logged, not thrown. */
async function removeQuietly(path: string): Promise<boolean> {
  try {
    await r2.remove(path)
    return true
  } catch (err) {
    console.error(`[demo] could not remove ${path}:`, err instanceof Error ? err.message : err)
    return false
  }
}

/** Deletes the account and everything it owns, files first. Returns how many files went. */
async function removeAccount(userId: string): Promise<number> {
  let removed = 0
  if (isR2Configured()) {
    const [images, exportsFiles, cached] = await Promise.all([
      captureRepo.filePathsForUser(userId),
      exportRepo.filePathsForUser(userId),
      renderCacheRepo.pathsForUser(userId),
    ])
    const paths = [...images, ...images.map(r2.thumbnailPath), ...exportsFiles, ...cached]
    for (const path of paths) if (await removeQuietly(path)) removed++
  }
  // Cancels any Midtrans Subscription first, as staff deletion does — the demo cannot
  // start one (lib/demo), but an account deleted with one live would go on being charged.
  await autoRenew.stopQuietly(userId)
  await userRepo.deleteById(userId)
  return removed
}

/** One capture image (and its thumbnail) copied to the demo's own path. Null when it could not be. */
async function copyImage(from: string, userId: string, captureId: string, at: Date): Promise<{ path: string; size: number } | null> {
  try {
    const png = await r2.download(from)
    const path = r2.capturePath(userId, captureId, at)
    await r2.upload(path, png, 'image/png')
    const thumb = await r2.download(r2.thumbnailPath(from)).catch(() => null)
    if (thumb) await r2.upload(r2.thumbnailPath(path), thumb, 'image/jpeg')
    return { path, size: png.length }
  } catch (err) {
    console.error(`[demo] could not copy image ${from}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** The sample zone and its day of captures. Skipped (with a log line) when the source zone is gone. */
async function seed(userId: string, now: Date): Promise<{ seededCaptures: number; sampleDay: string | null }> {
  const sourceId = config.demoSourceZoneId
  if (!sourceId) return { seededCaptures: 0, sampleDay: null }
  const source = await zoneRepo.findById(sourceId)
  if (!source) {
    console.warn(`[demo] DEMO_SOURCE_ZONE_ID ${sourceId} not found — the demo starts without a sample zone`)
    return { seededCaptures: 0, sampleDay: null }
  }

  const zone = await zoneRepo.create({
    userId,
    name: source.name,
    geometry: source.geometry,
    roadClass: source.roadClass,
    roadsCount: source.roadsCount,
    lengthKm: source.lengthKm,
  })

  // The latest day that has finished: today's would be half a day, still filling up.
  const sampleDay = await captureRepo.latestDoneWibDayBefore(sourceId, now)
  if (!sampleDay) return { seededCaptures: 0, sampleDay: null }

  const r2Ready = isR2Configured()
  let seededCaptures = 0
  for (const row of await captureRepo.listDoneOnWibDay(sourceId, sampleDay)) {
    const id = await captureRepo.copyInto(row.id, { userId, zoneId: zone.id })
    if (!id) continue
    seededCaptures++
    // Copied, not shared: the demo's files are deleted every night, and a shared path
    // would take the source account's image with them.
    if (r2Ready && row.filePath) {
      const image = await copyImage(row.filePath, userId, id, row.capturedAt)
      if (image) await captureRepo.setImage(id, image.path, image.size, undefined)
    }
  }
  return { seededCaptures, sampleDay }
}

/** Deletes the demo account (if any) and builds it again. */
export async function resetDemoAccount(now: Date = new Date()): Promise<DemoResetResult> {
  const email = config.demoEmail
  const password = config.demoPassword
  // env.ts refuses DEMO_ENABLED without one; this only guards a direct call.
  if (!password) throw new Error('DEMO_PASSWORD is not set')

  const existing = await userRepo.findByEmail(email)
  const filesRemoved = existing ? await removeAccount(existing.id) : 0

  const { user } = await userService.createUser({ email, password, fullName: 'Demo', plan: 'premium', role: 'user' })
  await userRepo.updateUser(user.id, { emailVerified: true })

  const { seededCaptures, sampleDay } = await seed(user.id, now)
  return { userId: user.id, replaced: !!existing, filesRemoved, seededCaptures, sampleDay }
}

/** Whether the demo account exists — the sweeper builds it at boot when it does not. */
export async function demoAccountExists(): Promise<boolean> {
  return !!(await userRepo.findByEmail(config.demoEmail))
}
