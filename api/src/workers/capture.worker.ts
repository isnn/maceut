import type { Channel, ConsumeMessage } from 'amqplib'
import { config, isR2Configured } from '../config/env'
import { publishRenderJob, safeAck, safeNack } from '../lib/rabbitmq-client'
import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import * as scheduleRepo from '../repositories/schedule.repository'
import type { CaptureRecord } from '../repositories/capture.repository'
import { bboxOfGeometry } from '../services/zone.service'
import { slimTraffic } from '../services/capture.service'
import * as here from '../lib/here-traffic-client'
import { functionalClassesFor } from '../lib/here-traffic-client'
import { meteredTrafficFlow } from '../services/here-usage.service'
import * as notificationService from '../services/notification.service'
import type { RoadClass } from '../types/plan'
import type { CaptureInterval } from '../types/schedule'

/**
 * Consumes capture jobs and collects one cycle each (BR-009, BR-010).
 *
 * The API decided this cycle may happen and wrote the row; this does the slow part.
 * Right now that means asking HERE for the zone's traffic at this moment and storing
 * the GeoJSON. The rendered PNG (BR-018's zone name and timestamp, BR-019's legend) is a
 * second step that fills `filePath` on the same row — nothing here has to change for it.
 *
 * ## Acknowledgement
 *
 * A job is acked once its outcome is written down, success or failure. Nacking a
 * failure back onto the queue would retry a capture whose moment has passed: the value
 * of a 07:00 frame is that it is from 07:00, and a retry at 07:04 is a different, worse
 * answer that also double-counts against the daily limit. So failures are recorded on
 * the row and the message is dropped.
 *
 * A job whose capture row has vanished — the zone was deleted mid-flight — is acked
 * too. Requeuing it forever would be the only alternative.
 */

interface CaptureJob {
  captureId: string
}

/** Mean jam factor across collected roads, or null when nothing was collected. */
function meanJamFactor(collection: here.TrafficCollection): number | null {
  if (collection.features.length === 0) return null
  const total = collection.features.reduce((sum, f) => sum + f.properties.jamFactor, 0)
  return Math.round((total / collection.features.length) * 100) / 100
}

/**
 * How late a queued scheduled cycle may start and still be collected: one interval of
 * its window, at most an hour. Later than that, the next cycle is due or close to it.
 */
export function lateToleranceMs(interval: CaptureInterval | null | undefined): number {
  return interval === '15min' ? 15 * 60_000 : 60 * 60_000
}

/**
 * Why a queued scheduled cycle should not be collected, or null to collect it.
 *
 * Normally every job starts within seconds of being queued. After a worker outage the
 * queue holds every cycle the scheduler fired meanwhile, and running them all at once
 * would store several near-identical frames taken in the same minute, each spending a
 * traffic request and the account's daily quota. So, per zone, only the newest waiting
 * cycle is collected, and only while it is within one interval of its due time. The
 * rest become `missed`, which counts against nothing (BR-006), the same as firings the
 * scheduler itself could not make.
 *
 * Manual captures are always collected: they were asked for now.
 */
export async function staleReason(capture: CaptureRecord, now: Date = new Date()): Promise<string | null> {
  if (capture.trigger !== 'scheduled' || !capture.scheduledFor) return null
  if (await captureRepo.hasNewerPending(capture.zoneId, capture.scheduledFor)) {
    return 'Not collected: the worker was offline when this was due, and a later capture of this zone was collected instead.'
  }
  const schedule = capture.scheduleId ? await scheduleRepo.findById(capture.scheduleId) : undefined
  const lateMs = now.getTime() - capture.scheduledFor.getTime()
  if (lateMs > lateToleranceMs(schedule?.interval)) {
    return `Not collected: the worker was offline and only reached this ${Math.round(lateMs / 60_000)} minutes after it was due.`
  }
  return null
}

export async function runCapture(captureId: string): Promise<void> {
  const capture = await captureRepo.findById(captureId)
  if (!capture) {
    console.warn(`[worker] capture ${captureId} no longer exists — dropping job`)
    return
  }
  if (capture.status !== 'pending') {
    // Already handled. A duplicate delivery must not collect a second time and charge
    // the account twice for one cycle.
    console.warn(`[worker] capture ${captureId} is ${capture.status}, not pending — skipping`)
    return
  }

  const stale = await staleReason(capture)
  if (stale) {
    // Kept on the row for us; users see only "Missed" (captureErrorForUser).
    await captureRepo.markStatus(captureId, 'missed', stale)
    console.warn(`[worker] capture ${captureId} marked missed (due ${capture.scheduledFor?.toISOString()}): ${stale}`)
    return
  }

  await captureRepo.markStatus(captureId, 'processing')

  let zoneName = 'Zone'
  try {
    const zone = await zoneRepo.findById(capture.zoneId)
    if (!zone) throw new Error('Zona sudah dihapus sebelum capture dijalankan.')
    zoneName = zone.name

    const flow = await meteredTrafficFlow('capture', bboxOfGeometry(zone.geometry), {
      // The class stored on the capture, already capped by BR-022 when it was queued.
      // Re-deriving it here would use the plan as it is now, not as it was when the
      // cycle was authorised.
      functionalClasses: functionalClassesFor(capture.roadClass as RoadClass),
      // Trim to the zone the user drew. HERE only accepts a bounding box, so without
      // this a stored capture records roads outside its own boundary — permanently,
      // since the GeoJSON is what the snapshot browser redraws.
      clipTo: zone.geometry.coordinates[0] as [number, number][],
    })

    await captureRepo.complete(captureId, {
      traffic: flow,
      // Stored once here so exports and playback never slim the full collection again.
      trafficSlim: slimTraffic(flow),
      roadsCount: flow.features.length,
      jamFactorAvg: meanJamFactor(flow),
    })

    console.log(`[worker] capture ${captureId} done — ${flow.features.length} roads`)

    // Ends a failure streak, if there was one (NOTIF).
    await notificationService.onCaptureDone(capture, zoneName)

    // CAP-02 — the image is a separate, single-file job: see render.worker.ts. A failure
    // to queue it leaves a complete capture without an image, never a failed capture.
    if (isR2Configured()) {
      await publishRenderJob({ captureId }).catch((err) =>
        console.error(`[worker] capture ${captureId} image not queued:`, err instanceof Error ? err.message : err),
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await captureRepo.markStatus(captureId, 'failed', message)
    console.error(`[worker] capture ${captureId} failed: ${message}`)
    // Starts a failure streak, if this is the first (NOTIF). Never throws.
    await notificationService.onCaptureFailed({ ...capture, error: message }, zoneName)
  }
}

export async function registerCaptureConsumer(ch: Channel): Promise<void> {
  // A handful at a time. One would serialise every account's captures behind each
  // other — with many users on hourly windows, the 07:00 burst would drain in single
  // file and the last frame would be minutes late. Unbounded would hit HERE's rate
  // limit for free. This is the dial to turn when throughput becomes the complaint,
  // and to turn down if HERE starts refusing.
  await ch.prefetch(config.captureConcurrency)

  await ch.consume(config.rabbitmqQueueCapture, (msg: ConsumeMessage | null) => {
    if (!msg) return

    void (async () => {
      try {
        const job = JSON.parse(msg.content.toString()) as CaptureJob
        if (!job?.captureId) throw new Error('job tanpa captureId')
        await runCapture(job.captureId)
      } catch (err) {
        // A malformed message can never succeed, so it goes to the dead-letter queue
        // rather than round-tripping forever.
        console.error('[worker] bad job:', err instanceof Error ? err.message : err)
        safeNack(ch, msg)
        return
      }
      safeAck(ch, msg)
    })()
  })

  console.log(`[worker] consuming ${config.rabbitmqQueueCapture} (prefetch ${config.captureConcurrency})`)
}
