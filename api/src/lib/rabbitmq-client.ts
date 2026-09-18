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
  await assertTopology(ch)

  connection = conn
  channel = ch
  return ch
}

export async function assertTopology(ch: amqp.Channel): Promise<void> {
  await ch.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true })
  await ch.assertQueue(config.rabbitmqQueueDeadLetter, { durable: true })
  await ch.bindQueue(config.rabbitmqQueueDeadLetter, DEAD_LETTER_EXCHANGE, '')
  await ch.assertQueue(config.rabbitmqQueueCapture, {
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

export interface QueueHealth {
  connected: boolean
  queues?: { name: string; messages: number; consumers: number }[]
  error?: string
}

export async function checkQueue(): Promise<QueueHealth> {
  try {
    const ch = await getChannel()
    const names = [config.rabbitmqQueueCapture, config.rabbitmqQueueDeadLetter]
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
