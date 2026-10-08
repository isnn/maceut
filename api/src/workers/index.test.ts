import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('../lib/drizzle-client', () => ({ db: {}, pool: {}, closeDb: vi.fn() }))
vi.mock('./capture.worker', () => ({ registerCaptureConsumer: vi.fn() }))
vi.mock('./export.worker', () => ({ registerExportConsumer: vi.fn() }))
vi.mock('./render.worker', () => ({ registerRenderConsumer: vi.fn() }))
vi.mock('../lib/rabbitmq-client', () => ({ openChannel: vi.fn(), closeQueue: vi.fn() }))

import { keepConsuming, MAX_REOPENS } from './index'
import type { Channel } from 'amqplib'

const flush = () => new Promise((r) => setTimeout(r, 5))

describe('keepConsuming', () => {
  it('reopens a closed channel and registers the consumer on the new one', async () => {
    const channels: EventEmitter[] = []
    const register = vi.fn(async () => undefined)
    await keepConsuming(
      { name: 'render', register },
      {
        openChannel: async () => {
          const ch = new EventEmitter()
          channels.push(ch)
          return ch as unknown as Channel
        },
        onGiveUp: vi.fn(),
        delayMs: 1,
      },
    )
    expect(register).toHaveBeenCalledTimes(1)

    channels[0]!.emit('close') // RabbitMQ closed it, as at the ack timeout
    await flush()

    expect(channels).toHaveLength(2)
    expect(register).toHaveBeenCalledTimes(2)
    expect(register).toHaveBeenLastCalledWith(channels[1])
  })

  it('gives up after repeated failures, so the container restarts', async () => {
    const onGiveUp = vi.fn()
    const openChannel = vi.fn(async () => {
      throw new Error('connection refused')
    })
    await keepConsuming({ name: 'capture', register: vi.fn() }, { openChannel, onGiveUp, delayMs: 1 })
    // Delays grow 1, 2, 3 ... ms per attempt.
    await new Promise((r) => setTimeout(r, 60))

    expect(openChannel).toHaveBeenCalledTimes(MAX_REOPENS + 1)
    expect(onGiveUp).toHaveBeenCalledWith('capture')
  })
})
