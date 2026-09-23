import type { Channel, ConsumeMessage } from 'amqplib'
import { config } from '../config/env'
import * as captureRepo from '../repositories/capture.repository'
import * as zoneRepo from '../repositories/zone.repository'
import { bboxOfGeometry } from '../services/zone.service'
import * as here from '../lib/here-traffic-client'
import { functionalClassesFor } from '../lib/here-traffic-client'
import type { RoadClass } from '../types/plan'

/**
 * Consumes capture jobs and collects one cycle each (BR-009, BR-010).
 *
 * The API decided this cycle may happen and wrote the row; this does the slow part.
 * Right now that means asking HERE for the zone's traffic at this moment and storing
 * the GeoJSON. The rendered PNG (BR-018's logo, zone name, timestamp and legend) is a
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

  await captureRepo.markStatus(captureId, 'processing')

  try {
    const zone = await zoneRepo.findById(capture.zoneId)
    if (!zone) throw new Error('Zona sudah dihapus sebelum capture dijalankan.')

    const flow = await here.getTrafficFlow(bboxOfGeometry(zone.geometry), {
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
      roadsCount: flow.features.length,
      jamFactorAvg: meanJamFactor(flow),
    })

    console.log(`[worker] capture ${captureId} done — ${flow.features.length} roads`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await captureRepo.markStatus(captureId, 'failed', message)
    console.error(`[worker] capture ${captureId} failed: ${message}`)
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
        ch.nack(msg, false, false)
        return
      }
      ch.ack(msg)
    })()
  })

  console.log(`[worker] consuming ${config.rabbitmqQueueCapture} (prefetch ${config.captureConcurrency})`)
}
