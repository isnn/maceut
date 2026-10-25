import fs from 'node:fs'
import type { Channel } from 'amqplib'
import { config } from '../config/env'
import { openChannel, closeQueue } from '../lib/rabbitmq-client'
import { closeDb } from '../lib/drizzle-client'
import { registerCaptureConsumer } from './capture.worker'
import { registerExportConsumer } from './export.worker'
import { registerRenderConsumer } from './render.worker'

/**
 * Worker process entry point.
 *
 * Registers the consumers and otherwise stays out of the way. Each consumer lives in
 * its own file; this file owns the process — connection, channels, health, shutdown —
 * so that concern is in one place whatever consumers are added later.
 *
 * ## One channel per consumer
 *
 * RabbitMQ closes a whole channel when one delivery on it breaks a rule. With one
 * shared channel, a capture image that hung past the 30-minute ack limit took captures
 * and exports down with it (2026-10-08). Now each consumer has its own channel; a
 * closed one is reopened after a pause, and only repeated failure ends the process.
 *
 * ## Exiting
 *
 * When a consumer cannot be brought back, the process exits and its supervisor
 * restarts it: Docker's restart policy, which only works because the worker no longer
 * runs under `tsx watch` (a watcher outlives the program and keeps the container "up").
 *
 * ## Heartbeat
 *
 * While every consumer has an open channel, the process touches HEARTBEAT_FILE every
 * HEARTBEAT_MS. docker-compose's healthcheck reads its age, so a worker that is running
 * but not consuming shows as unhealthy instead of quietly "Up".
 */

export const HEARTBEAT_FILE = '/tmp/worker-heartbeat'
const HEARTBEAT_MS = 30_000

/** Reopen attempts in a row before giving up; each waits a little longer. */
export const MAX_REOPENS = 5
const REOPEN_DELAY_MS = 5_000
/** A channel that stayed open this long resets the attempt count: it was not a loop. */
const STABLE_AFTER_MS = 5 * 60_000

let shuttingDown = false

interface Consumer {
  name: string
  register: (ch: Channel) => Promise<void>
}

const CONSUMERS: Consumer[] = [
  { name: 'capture', register: registerCaptureConsumer },
  { name: 'export', register: registerExportConsumer },
  { name: 'render', register: registerRenderConsumer },
]

/** Which consumers currently have an open channel. */
const open = new Map<string, boolean>()

interface KeepOptions {
  openChannel: () => Promise<Channel>
  onGiveUp: (name: string) => void
  delayMs?: number
}

/**
 * Keeps one consumer on its own channel: opens it, registers, and when the channel
 * closes (and the process is not shutting down) opens a new one after a growing pause.
 * After MAX_REOPENS failures in a row it calls `onGiveUp`.
 */
export async function keepConsuming(consumer: Consumer, opts: KeepOptions): Promise<void> {
  const delay = opts.delayMs ?? REOPEN_DELAY_MS
  let failures = 0

  const start = async (): Promise<void> => {
    let ch: Channel
    try {
      ch = await opts.openChannel()
      await consumer.register(ch)
    } catch (err) {
      console.error(`[worker] ${consumer.name} consumer could not start:`, err instanceof Error ? err.message : err)
      return retry()
    }
    open.set(consumer.name, true)
    const openedAt = Date.now()
    ch.on('error', (err: Error) => console.error(`[worker] ${consumer.name} channel error:`, err.message))
    ch.on('close', () => {
      open.set(consumer.name, false)
      if (shuttingDown) return
      if (Date.now() - openedAt >= STABLE_AFTER_MS) failures = 0
      console.error(`[worker] ${consumer.name} channel closed — reopening`)
      void retry()
    })
  }

  const retry = async (): Promise<void> => {
    failures++
    if (failures > MAX_REOPENS) {
      opts.onGiveUp(consumer.name)
      return
    }
    await new Promise((r) => setTimeout(r, delay * failures))
    if (!shuttingDown) await start()
  }

  open.set(consumer.name, false)
  await start()
}

/** True while every consumer has an open channel. */
export function allConsuming(): boolean {
  return CONSUMERS.every((c) => open.get(c.name))
}

function touchHeartbeat(): void {
  if (!allConsuming()) return
  const now = new Date()
  try {
    fs.utimesSync(HEARTBEAT_FILE, now, now)
  } catch {
    fs.writeFileSync(HEARTBEAT_FILE, '')
  }
}

function giveUp(name: string): void {
  console.error(`[worker] ${name} consumer failed ${MAX_REOPENS} times in a row — exiting so the container restarts`)
  process.exit(1)
}

async function main() {
  // Declaring the topology is not busywork: whichever of api or worker starts first
  // creates the queues, so neither has to wait for the other. openChannel does it.
  for (const consumer of CONSUMERS) {
    await keepConsuming(consumer, { openChannel, onGiveUp: giveUp })
  }
  console.log(
    `[worker] connected — queues ${config.rabbitmqQueueCapture}, ${config.rabbitmqQueueExport}, ${config.rabbitmqQueueRender}, one channel each`,
  )
  touchHeartbeat()
  setInterval(touchHeartbeat, HEARTBEAT_MS).unref()
}

async function shutdown(signal: string) {
  shuttingDown = true
  console.log(`[worker] ${signal} — shutting down`)
  await Promise.allSettled([closeQueue(), closeDb()])
  process.exit(0)
}

// Only when run as the worker process; tests import keepConsuming without starting it.
if (require.main === module) {
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  main().catch((err) => {
    console.error('[worker] failed to start:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
