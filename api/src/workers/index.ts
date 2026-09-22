import { config } from '../config/env'
import { getChannel, closeQueue } from '../lib/rabbitmq-client'
import { closeDb } from '../lib/drizzle-client'
import { registerCaptureConsumer } from './capture.worker'

/**
 * Worker process entry point.
 *
 * Registers the capture consumer and otherwise stays out of the way. The consumer
 * itself lives in `capture.worker.ts`; this file owns the process — connection,
 * topology, shutdown — so that concern is in one place whatever consumers are added
 * later.
 *
 * Declaring the topology here is not busywork: whichever of api or worker starts
 * first creates the queues, so neither has to wait for the other.
 */
async function main() {
  const ch = await getChannel()
  console.log(`[worker] connected — queues ${config.rabbitmqQueueCapture}, ${config.rabbitmqQueueDeadLetter} asserted`)
  await registerCaptureConsumer(ch)

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
