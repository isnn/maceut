import amqp from 'amqplib'
import { config } from '../config/env'

/**
 * One connection and one channel per process, opened lazily.
 *
 * The capture queue is declared with a dead-letter exchange so a job that fails
 * repeatedly lands somewhere inspectable instead of being redelivered forever
 * (ADR-005). Both the API (which publishes) and the worker (which consumes) call
 * `assertTopology`, so whichever starts first creates the queues — neither has to
 * wait for the other.
 */

// amqplib >= 0.10.6: connect() resolves to a ChannelModel, which wraps the
// Connection. `Connection` is still exported but is no longer what you get back.
let connection: amqp.ChannelModel | null = null
let channel: amqp.Channel | null = null

const DEAD_LETTER_EXCHANGE = 'capture-dlx'

export async function getChannel(): Promise<amqp.Channel> {
  if (channel) return channel

  const conn = await amqp.connect(config.rabbitmqUrl)
  conn.on('error', (err: Error) => console.error('[rabbitmq] connection error:', err.message))
  conn.on('close', () => {
    // Drop the handles so the next call reconnects rather than using a dead channel.
    connection = null
    channel = null
  })

  const ch = await conn.createChannel()

  // A channel can die on its own — a 404 from checkQueue against a deleted queue
  // closes it. In practice that error also propagates to the connection, whose close
  // handler above clears the cache, so recovery happens either way; this makes it not
  // depend on that propagation. Without one of the two, the dead channel stays cached
  // and every later publish fails forever.
  ch.on('error', (err: Error) => console.error('[rabbitmq] channel error:', err.message))
  ch.on('close', () => {
    channel = null
  })

  await assertTopology(ch)

  connection = conn
  channel = ch
  return ch
}

/**
 * A fresh channel on the shared connection, for one worker consumer. Each consumer
 * gets its own, because RabbitMQ closes a whole channel when one of its deliveries
 * breaks a rule (an ack timeout, say): on a shared channel one stuck render stopped
 * captures and exports with it (2026-10-08).
 */
export async function openChannel(): Promise<amqp.Channel> {
  await getChannel() // connects and declares the queues, if nothing has yet
  if (!connection) throw new Error('RabbitMQ connection closed while opening a channel')
  return connection.createChannel()
}

/**
 * Ack, unless the channel the message came on has closed meanwhile. A job that finishes
 * after its channel died must not throw: RabbitMQ has already put the message back,
 * and the duplicate is skipped by the job's own status check.
 */
export function safeAck(ch: amqp.Channel, msg: amqp.Message): void {
  try {
    ch.ack(msg)
  } catch (err) {
    console.warn('[rabbitmq] ack dropped, channel closed:', err instanceof Error ? err.message : err)
  }
}

/** Nack without requeue (to the dead-letter queue), with the same closed-channel guard. */
export function safeNack(ch: amqp.Channel, msg: amqp.Message): void {
  try {
    ch.nack(msg, false, false)
  } catch (err) {
    console.warn('[rabbitmq] nack dropped, channel closed:', err instanceof Error ? err.message : err)
  }
}

export async function assertTopology(ch: amqp.Channel): Promise<void> {
  await ch.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true })
  await ch.assertQueue(config.rabbitmqQueueDeadLetter, { durable: true })
  await ch.bindQueue(config.rabbitmqQueueDeadLetter, DEAD_LETTER_EXCHANGE, '')
  await ch.assertQueue(config.rabbitmqQueueCapture, {
    durable: true,
    deadLetterExchange: DEAD_LETTER_EXCHANGE,
  })
  await ch.assertQueue(config.rabbitmqQueueExport, {
    durable: true,
    deadLetterExchange: DEAD_LETTER_EXCHANGE,
  })
  await ch.assertQueue(config.rabbitmqQueueRender, {
    durable: true,
    deadLetterExchange: DEAD_LETTER_EXCHANGE,
  })
}

export interface CaptureJob {
  captureId: string
}

export async function publishCaptureJob(job: CaptureJob): Promise<void> {
  const ch = await getChannel()
  // persistent: survives a broker restart — a queued capture should not vanish.
  ch.sendToQueue(config.rabbitmqQueueCapture, Buffer.from(JSON.stringify(job)), { persistent: true })
}

export interface ExportJob {
  exportId: string
}

export async function publishExportJob(job: ExportJob): Promise<void> {
  const ch = await getChannel()
  ch.sendToQueue(config.rabbitmqQueueExport, Buffer.from(JSON.stringify(job)), { persistent: true })
}

export interface RenderJob {
  captureId: string
}

export async function publishRenderJob(job: RenderJob): Promise<void> {
  const ch = await getChannel()
  ch.sendToQueue(config.rabbitmqQueueRender, Buffer.from(JSON.stringify(job)), { persistent: true })
}

export interface QueueHealth {
  connected: boolean
  queues?: { name: string; messages: number; consumers: number }[]
  error?: string
}

export async function checkQueue(): Promise<QueueHealth> {
  try {
    const ch = await getChannel()
    const names = [config.rabbitmqQueueCapture, config.rabbitmqQueueExport, config.rabbitmqQueueRender, config.rabbitmqQueueDeadLetter]
    const queues = []
    for (const name of names) {
      const info = await ch.checkQueue(name)
      queues.push({ name, messages: info.messageCount, consumers: info.consumerCount })
    }
    return { connected: true, queues }
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function closeQueue(): Promise<void> {
  try {
    await channel?.close()
    await connection?.close()
  } finally {
    channel = null
    connection = null
  }
}
