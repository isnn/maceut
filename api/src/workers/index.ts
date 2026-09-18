import { config } from '../config/env'
import { getChannel, closeQueue } from '../lib/rabbitmq-client'
import { closeDb } from '../lib/drizzle-client'

/**
 * Worker process entry point.
 *
 * There is no consumer yet — `capture.worker.ts` arrives with the capture pipeline
 * (zone-management tasks.md Phase 3). This exists now because docker-compose already
 * runs a `worker` service, and a missing entry point would crash-loop the container
 * and bury every other service's logs under its restarts.
 *
 * Declaring the topology here is not busywork: whichever of api or worker starts
 * first creates the queues, so neither has to wait for the other.
 */
async function main() {
  const ch = await getChannel()
  console.log(`[worker] connected — queues ${config.rabbitmqQueueCapture}, ${config.rabbitmqQueueDeadLetter} asserted`)
  console.log('[worker] no consumers registered yet (capture pipeline is Phase 3); idling')

  ch.on('close', () => {
    console.error('[worker] channel closed — exiting so the container restarts')
    process.exit(1)
  })
}

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} — shutting down`)
  await Promise.allSettled([closeQueue(), closeDb()])
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

main().catch((err) => {
  console.error('[worker] failed to start:', err instanceof Error ? err.message : err)
  process.exit(1)
})
