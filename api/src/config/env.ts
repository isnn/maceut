/**
 * Loads and validates the environment, once, at import time.
 *
 * Two rules shape this file:
 *
 * 1. Field names are flat camelCase (`config.hereApiKey`) — structure.md's naming
 *    table specifies exactly that.
 *
 * 2. Credentials for *external* services (R2, HERE) are optional to boot with.
 *    The API refusing to start because R2 is unconfigured would be wrong — almost
 *    no endpoint touches R2, and a half-configured dev machine should still be able
 *    to run auth and zones. The clients that need them fail loudly at call time
 *    instead (see `requireR2()` / `requireHere()`), and `npm run env:check` reports
 *    them. Anything the process genuinely cannot run without — the database, the
 *    JWT secret — is required here and fails at boot.
 */
import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { z } from 'zod'

/**
 * An unset optional value, allowing for how the two env parsers differ.
 *
 * dotenv strips an inline `# comment` and leaves `''`. Docker Compose's `env_file`
 * strips it too — but only when there is a value in front of it. With an empty value,
 * `KEY=   # fill me` arrives as the literal string `# fill me`, which every
 * `if (value)` check in the codebase would read as configured. Treating a leading `#`
 * as unset closes that gap, and costs nothing: no real key or URL starts with one.
 */
const optionalStr = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === '' || v.startsWith('#') ? undefined : v))

const requiredStr = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required but empty`)

const boolFromEnv = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true'))

const intFromEnv = (fallback: number) => z.coerce.number().int().positive().optional().default(fallback)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: intFromEnv(8080),
  APP_BASE_URL: z.string().url().default('http://localhost:8080'),

  DB_HOST: requiredStr('DB_HOST'),
  DB_PORT: intFromEnv(5432),
  DB_NAME: requiredStr('DB_NAME'),
  DB_USER: requiredStr('DB_USER'),
  DB_PASSWORD: requiredStr('DB_PASSWORD'),
  DB_SSLMODE: z.enum(['disable', 'require']).default('disable'),
  DATABASE_URL: optionalStr,
  DB_POOL_MAX: intFromEnv(25),
  DB_POOL_IDLE_TIMEOUT_MS: intFromEnv(30_000),

  /**
   * Comma-separated emails granted the `internal` platform role (BR-027).
   * Unlike the frontend's NEXT_PUBLIC_INTERNAL_EMAILS, this one is server-side and
   * is the actual authority — the frontend copy only decides what to render.
   */
  INTERNAL_EMAILS: z
    .string()
    .trim()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && !e.startsWith('#')),
    ),

  JWT_SECRET: requiredStr('JWT_SECRET').min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().trim().default('7d'),
  COOKIE_DOMAIN: z.string().trim().default('localhost'),
  COOKIE_SECURE: boolFromEnv(false),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),

  RABBITMQ_URL: requiredStr('RABBITMQ_URL'),
  RABBITMQ_QUEUE_CAPTURE: z.string().trim().default('capture-jobs'),
  RABBITMQ_QUEUE_DEAD_LETTER: z.string().trim().default('capture-dead-letter'),

  // Optional at boot — see rule 2 above.
  R2_ACCOUNT_ID: optionalStr,
  R2_ACCESS_KEY_ID: optionalStr,
  R2_ACCESS_KEY_SECRET: optionalStr,
  R2_BUCKET_NAME: optionalStr,
  R2_PUBLIC_URL: optionalStr,
  R2_ENDPOINT: optionalStr,

  HERE_API_KEY: optionalStr,
  HERE_TRAFFIC_FLOW_URL: z.string().url().default('https://data.traffic.hereapi.com/v7/flow'),

  OSM_TILE_URL: z.string().trim().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),

  PLAYWRIGHT_HEADLESS: boolFromEnv(true),
  PLAYWRIGHT_TIMEOUT_MS: intFromEnv(30_000),
  PLAYWRIGHT_SCREENSHOT_WIDTH: intFromEnv(1280),
  PLAYWRIGHT_SCREENSHOT_HEIGHT: intFromEnv(720),
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: optionalStr,

  FRONTEND_URL: z.string().url('FRONTEND_URL must be a full origin, e.g. http://localhost:3000'),
  RENDER_BASE_URL: z.string().url().default('http://web:3000'),

  SWAGGER_ENABLED: boolFromEnv(true),
})

function parseEnv(raw: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(
      `Invalid environment in api/.env — ${result.error.issues.length} problem(s):\n${lines.join('\n')}\n\n` +
        `Compare against api/.env.example. Every key there has a comment explaining what it is for.`,
    )
  }
  return result.data
}

/**
 * Postgres connection string. Derived from the DB_* parts so there is one source of
 * truth; DATABASE_URL overrides it only when explicitly set, for managed databases
 * that need connection parameters the parts cannot express.
 */
function deriveDatabaseUrl(e: z.infer<typeof schema>): string {
  if (e.DATABASE_URL) return e.DATABASE_URL
  const auth = `${encodeURIComponent(e.DB_USER)}:${encodeURIComponent(e.DB_PASSWORD)}`
  const ssl = e.DB_SSLMODE === 'require' ? '?sslmode=require' : ''
  return `postgres://${auth}@${e.DB_HOST}:${e.DB_PORT}/${e.DB_NAME}${ssl}`
}

/**
 * R2's S3 endpoint is `https://{account}.r2.cloudflarestorage.com`. Jurisdiction-bound
 * buckets use a different host (EU inserts `.eu.`), which only R2_ENDPOINT can express.
 */
function deriveR2Endpoint(e: z.infer<typeof schema>): string | undefined {
  if (e.R2_ENDPOINT) return e.R2_ENDPOINT
  if (!e.R2_ACCOUNT_ID) return undefined
  return `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
}

export function buildConfig(raw: NodeJS.ProcessEnv = process.env) {
  const e = parseEnv(raw)
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    appBaseUrl: e.APP_BASE_URL,

    dbHost: e.DB_HOST,
    dbPort: e.DB_PORT,
    dbName: e.DB_NAME,
    dbUser: e.DB_USER,
    dbPassword: e.DB_PASSWORD,
    dbSslMode: e.DB_SSLMODE,
    databaseUrl: deriveDatabaseUrl(e),
    dbPoolMax: e.DB_POOL_MAX,
    dbPoolIdleTimeoutMs: e.DB_POOL_IDLE_TIMEOUT_MS,

    internalEmails: e.INTERNAL_EMAILS,

    jwtSecret: e.JWT_SECRET,
    jwtExpiry: e.JWT_EXPIRY,
    cookieDomain: e.COOKIE_DOMAIN,
    cookieSecure: e.COOKIE_SECURE,
    cookieSameSite: e.COOKIE_SAME_SITE,

    rabbitmqUrl: e.RABBITMQ_URL,
    rabbitmqQueueCapture: e.RABBITMQ_QUEUE_CAPTURE,
    rabbitmqQueueDeadLetter: e.RABBITMQ_QUEUE_DEAD_LETTER,

    r2AccountId: e.R2_ACCOUNT_ID,
    r2AccessKeyId: e.R2_ACCESS_KEY_ID,
    r2AccessKeySecret: e.R2_ACCESS_KEY_SECRET,
    r2BucketName: e.R2_BUCKET_NAME,
    r2PublicUrl: e.R2_PUBLIC_URL,
    r2Endpoint: deriveR2Endpoint(e),

    hereApiKey: e.HERE_API_KEY,
    hereTrafficFlowUrl: e.HERE_TRAFFIC_FLOW_URL,

    osmTileUrl: e.OSM_TILE_URL,

    playwrightHeadless: e.PLAYWRIGHT_HEADLESS,
    playwrightTimeoutMs: e.PLAYWRIGHT_TIMEOUT_MS,
    playwrightScreenshotWidth: e.PLAYWRIGHT_SCREENSHOT_WIDTH,
    playwrightScreenshotHeight: e.PLAYWRIGHT_SCREENSHOT_HEIGHT,
    playwrightChromiumExecutablePath: e.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,

    frontendUrl: e.FRONTEND_URL,
    renderBaseUrl: e.RENDER_BASE_URL,

    swaggerEnabled: e.SWAGGER_ENABLED,
  }
}

export type Config = ReturnType<typeof buildConfig>

export const config: Config = buildConfig()

/** True when every value the R2 client needs is present. */
export function isR2Configured(c: Config = config): boolean {
  return Boolean(c.r2AccountId && c.r2AccessKeyId && c.r2AccessKeySecret && c.r2BucketName && c.r2Endpoint)
}

/** True when the HERE Traffic client can be used. */
export function isHereConfigured(c: Config = config): boolean {
  return Boolean(c.hereApiKey)
}

/** Names of the env keys each integration is still missing — for env:check and boot warnings. */
export function missingIntegrationKeys(c: Config = config): { r2: string[]; here: string[] } {
  const r2: string[] = []
  if (!c.r2AccountId) r2.push('R2_ACCOUNT_ID')
  if (!c.r2AccessKeyId) r2.push('R2_ACCESS_KEY_ID')
  if (!c.r2AccessKeySecret) r2.push('R2_ACCESS_KEY_SECRET')
  if (!c.r2BucketName) r2.push('R2_BUCKET_NAME')

  const here: string[] = []
  if (!c.hereApiKey) here.push('HERE_API_KEY')

  return { r2, here }
}
