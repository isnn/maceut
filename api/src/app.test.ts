import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// Mocked before importing app: both are called by the health controller, and neither
// should open a real socket in a unit test.
vi.mock('./lib/drizzle-client', () => ({
  checkDb: vi.fn(),
  closeDb: vi.fn(),
  db: {},
  pool: {},
}))
vi.mock('./lib/rabbitmq-client', () => ({
  checkQueue: vi.fn(),
  closeQueue: vi.fn(),
  getChannel: vi.fn(),
}))

import { app } from './app'
import { checkDb } from './lib/drizzle-client'
import { checkQueue } from './lib/rabbitmq-client'

const healthyDb = { connected: true, version: 'PostgreSQL 16.4', postgis: '3.4.2' }
const healthyQueue = { connected: true, queues: [{ name: 'capture-jobs', messages: 0, consumers: 0 }] }

beforeEach(() => {
  vi.mocked(checkDb).mockResolvedValue(healthyDb)
  vi.mocked(checkQueue).mockResolvedValue(healthyQueue)
})

describe('GET /health', () => {
  it('returns 200 with both dependencies up', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('ok')
    expect(res.body.data.db.postgis).toBe('3.4.2')
  })

  it('returns 503 but still says which dependency is down', async () => {
    vi.mocked(checkDb).mockResolvedValue({ connected: false, error: 'ECONNREFUSED' })

    const res = await request(app).get('/health')
    expect(res.status).toBe(503)
    expect(res.body.data.status).toBe('degraded')
    expect(res.body.data.db.error).toBe('ECONNREFUSED')
    // The half that works still reports as working — that is the point of the body.
    expect(res.body.data.queue.connected).toBe(true)
  })

  it('reports unconfigured integrations without failing the check', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.data.integrations).toHaveProperty('r2')
    expect(res.body.data.integrations).toHaveProperty('here')
  })
})

describe('error envelope', () => {
  it('answers an unknown route in the standard shape, not Express HTML', async () => {
    const res = await request(app).get('/no-such-endpoint')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/json/)
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
  })

  it('treats malformed JSON as a bad request, not a server error', async () => {
    const res = await request(app).post('/no-such-endpoint').set('Content-Type', 'application/json').send('{"broken"')
    expect(res.status).toBe(422)
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } })
    // A 500 here would bury real crashes in noise from ordinary client mistakes.
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:/)
  })
})

describe('swagger', () => {
  it('serves a spec that includes the documented routes', async () => {
    const res = await request(app).get('/api-docs.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toBe('3.0.3')
    // Proves the JSDoc scan actually found the route files — an empty `paths` is the
    // usual symptom of a wrong glob, and it fails silently.
    expect(res.body.paths).toHaveProperty('/health')
  })
})
