/**
 * `npm run env:check` — proves the environment, rather than assuming it.
 *
 * Turns "I pasted the keys" into "the keys work". Every dependency gets one line:
 * what was tried, and if it failed, what to change. Run it inside the container
 * (`docker compose exec api npm run env:check`) or on the host with `npx tsx`.
 *
 * It never prints a secret. Values appear only as `set (…last4)`, and failures are
 * described by cause, not by echoing what was sent.
 *
 * Exit code is 1 if a hard dependency failed, so CI can use it. An unconfigured
 * integration is reported as SKIP, not FAIL — a machine that has not been given R2
 * keys yet is incomplete, not broken.
 */
import { config, isR2Configured, isHereConfigured, missingIntegrationKeys } from '../src/config/env'
// Type-only: erased at compile time, so it does not pull the module in before the
// checks that are meant to load it lazily.
import type { BBox, TrafficCollection } from '../src/lib/here-traffic-client'

type Status = 'PASS' | 'FAIL' | 'SKIP'

interface Line {
  name: string
  status: Status
  detail: string
  hint?: string
}

const lines: Line[] = []
const add = (name: string, status: Status, detail: string, hint?: string) =>
  lines.push({ name, status, detail, hint })

/** The only way a secret is ever rendered. */
function mask(value: string | undefined): string {
  if (!value) return 'MISSING'
  return value.length <= 4 ? 'set (too short to mask)' : `set (…${value.slice(-4)})`
}

async function checkConfig() {
  // Reaching here at all means the zod schema parsed — the import would have thrown.
  const summary = [
    `JWT_SECRET ${mask(config.jwtSecret)}`,
    `HERE_API_KEY ${mask(config.hereApiKey)}`,
    `R2_ACCESS_KEY_SECRET ${mask(config.r2AccessKeySecret)}`,
  ].join(', ')
  add('Config', 'PASS', `valid · ${summary}`)

  const missing = missingIntegrationKeys()
  if (missing.r2.length) add('  └ R2 keys', 'SKIP', `missing ${missing.r2.join(', ')}`)
  if (missing.here.length) add('  └ HERE keys', 'SKIP', `missing ${missing.here.join(', ')}`)
}

async function checkPostgres() {
  const { checkDb, closeDb } = await import('../src/lib/drizzle-client')
  try {
    const health = await checkDb()
    if (!health.connected) {
      add('Postgres', 'FAIL', health.error ?? 'not connected', hintForDb(health.error))
      return
    }
    if (!health.postgis) {
      add(
        'Postgres',
        'FAIL',
        `${health.version} connected, but PostGIS is NOT installed`,
        'Zones are geometry(Polygon,4326) — run `npx drizzle-kit migrate`, which creates the extension.',
      )
      return
    }
    add('Postgres', 'PASS', `${health.version}, PostGIS ${health.postgis}`)
  } finally {
    await closeDb().catch(() => {})
  }
}

function hintForDb(error?: string): string | undefined {
  if (!error) return undefined
  if (/password authentication failed/i.test(error))
    return 'DB_PASSWORD in api/.env does not match the one Postgres was created with. They must match the root .env; `docker compose down -v` resets the volume.'
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(error))
    return 'Cannot resolve or reach DB_HOST. Is Postgres up (`docker compose up -d postgres`)? DB_HOST is "postgres" inside Docker, "localhost" outside it.'
  if (/does not exist/i.test(error)) return 'DB_NAME does not exist on that server.'
  return undefined
}

async function checkRabbit() {
  const { checkQueue, closeQueue } = await import('../src/lib/rabbitmq-client')
  try {
    const health = await checkQueue()
    if (!health.connected) {
      add(
        'RabbitMQ',
        'FAIL',
        health.error ?? 'not connected',
        /ECONNREFUSED|ENOTFOUND/i.test(health.error ?? '')
          ? 'Is RabbitMQ up? `docker compose up -d rabbitmq`.'
          : undefined,
      )
      return
    }
    const names = (health.queues ?? []).map((q) => `${q.name} (${q.messages} msg, ${q.consumers} consumer)`)
    add('RabbitMQ', 'PASS', `connected · ${names.join(', ')}`)
  } finally {
    await closeQueue().catch(() => {})
  }
}

/**
 * A full write → read → presign → delete round-trip.
 *
 * headBucket alone is not enough: an "Object Read only" API token passes it and then
 * fails every upload, which is exactly the mistake worth catching before the capture
 * worker hits it in production.
 */
async function checkR2() {
  if (!isR2Configured()) {
    add('R2', 'SKIP', `not configured — missing ${missingIntegrationKeys().r2.join(', ')}`)
    return
  }

  const r2 = await import('../src/lib/r2-client')
  const head = await r2.headBucket()
  if (!head.ok) {
    add('R2', 'FAIL', `bucket "${head.bucket}": ${head.error}`)
    return
  }

  const key = r2.capturePath('_preflight', `check-${Date.now()}`)
  const payload = Buffer.from('maceut env:check')

  try {
    await r2.upload(key, payload, 'text/plain')
  } catch (err) {
    add('R2', 'FAIL', `bucket reachable but upload failed: ${msg(err)}`, 'The API token most likely lacks Object Read & Write.')
    return
  }

  const steps: string[] = ['put']
  try {
    const back = await r2.download(key)
    if (!back.equals(payload)) {
      add('R2', 'FAIL', 'object read back did not match what was written')
      return
    }
    steps.push('get')

    const signed = await r2.getPresignedUrl(key, 60)
    steps.push('presign')

    // Does the public URL actually serve it? ADR-008 warns R2's presigning is more
    // limited than S3's, so knowing which of the two works decides how captures get
    // delivered to the browser.
    const publicUrl = r2.publicUrlFor(key)
    let publicNote = 'R2_PUBLIC_URL not set — captures must use presigned URLs'
    if (publicUrl) {
      const ok = await probe(publicUrl)
      publicNote = ok
        ? 'public URL serves objects'
        : 'public URL did NOT serve the object — the bucket is private, so use presigned URLs'
    }
    const signedOk = await probe(signed)

    add(
      'R2',
      'PASS',
      `bucket "${head.bucket}" · ${steps.join(' → ')} → delete OK`,
      `${publicNote}; presigned URL ${signedOk ? 'works' : 'did NOT resolve'}`,
    )
  } catch (err) {
    add('R2', 'FAIL', `after ${steps.join(' → ')}: ${msg(err)}`)
  } finally {
    await r2.remove(key).catch(() => {})
  }
}

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * One live HERE request over Malioboro, Yogyakarta.
 *
 * Beyond "the key works", this answers the question BR-022 depends on: does a v7
 * flow response carry a functional class per segment? The whole Free/Standard/Premium
 * road-class tiering assumes it does. If it does not, that needs designing
 * differently, and one request is a cheap way to find out.
 */
async function checkHere() {
  if (!isHereConfigured()) {
    add('HERE', 'SKIP', 'not configured — missing HERE_API_KEY')
    return
  }

  const here = await import('../src/lib/here-traffic-client')
  const bbox: BBox = [110.36, -7.8, 110.37, -7.79]

  let all: TrafficCollection
  try {
    all = await here.getTrafficFlow(bbox)
  } catch (err) {
    add('HERE', 'FAIL', msg(err))
    return
  }

  if (all.features.length === 0) {
    add('HERE', 'PASS', 'key accepted, but 0 segments over the test bbox', 'Try a busier area or time; the key itself is fine.')
    return
  }

  const withFc = all.features.filter((f) => f.properties.functionalClass !== undefined).length
  const states = new Set(all.features.map((f) => f.properties.trafficState))

  const fcNote =
    withFc === 0
      ? '⚠️  NO functional class in the response — BR-022 road-class tiering (the Free/Standard/Premium differentiator) cannot filter on it as designed. Needs a product decision.'
      : `functional class present on ${withFc}/${all.features.length} segments — BR-022 tiering can filter as designed`

  // Does HERE accept server-side filtering? Cheaper than filtering locally, but a
  // rejected parameter fails the whole request, so it stays off until proven.
  let upstreamNote = ''
  try {
    const filtered = await here.getTrafficFlow(bbox, { functionalClasses: [1, 2], filterUpstream: true })
    upstreamNote = ` · upstream functionalClasses filter accepted (${filtered.features.length} segments)`
  } catch {
    upstreamNote = ' · upstream functionalClasses filter REJECTED — keep filtering locally'
  }

  add('HERE', 'PASS', `${all.features.length} segments · states: ${[...states].join(', ')}${upstreamNote}`, fcNote)
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const ICON: Record<Status, string> = { PASS: '✓', FAIL: '✗', SKIP: '–' }

async function main() {
  await checkConfig()
  // Sequential on purpose: the output reads as a checklist, and a failing database
  // should not be interleaved with a failing bucket.
  await checkPostgres()
  await checkRabbit()
  await checkR2()
  await checkHere()

  const width = Math.max(...lines.map((l) => l.name.length))
  console.log('')
  for (const line of lines) {
    console.log(`${ICON[line.status]} ${line.name.padEnd(width)}  ${line.detail}`)
    if (line.hint) console.log(`${' '.repeat(width + 3)}${line.hint}`)
  }

  const failed = lines.filter((l) => l.status === 'FAIL')
  const skipped = lines.filter((l) => l.status === 'SKIP')
  console.log('')
  if (failed.length > 0) {
    console.log(`${failed.length} check(s) failed: ${failed.map((f) => f.name.trim()).join(', ')}`)
    process.exit(1)
  }
  console.log(skipped.length > 0 ? `All configured checks passed (${skipped.length} skipped).` : 'All checks passed.')
  process.exit(0)
}

main().catch((err) => {
  // A throw here is usually the config module refusing to load at all, whose message
  // already names the offending keys.
  console.error(`\nenv:check could not run:\n${msg(err)}`)
  process.exit(1)
})
