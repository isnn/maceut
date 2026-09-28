/**
 * The running server's configuration, for staff to read on /internal/config (BE-12).
 *
 * Read-only by design (ADR-018): config comes from `.env` at container start, and
 * making it editable from a web page would mean storing secrets in the database and
 * letting one mistyped value take the platform down. This mirrors what the server
 * actually loaded, so staff can see what is set without shell access.
 *
 * Secrets are never returned — only whether they are set. Connection URLs that embed
 * a password (DATABASE_URL, RABBITMQ_URL) come back with the password masked.
 */

/** Every key the API reads, in the order the page shows them. */
export const CONFIG_KEYS = [
  'NODE_ENV',
  'PORT',
  'APP_BASE_URL',
  'FRONTEND_URL',
  'RENDER_BASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SSLMODE',
  'DATABASE_URL',
  'DB_POOL_MAX',
  'DB_POOL_IDLE_TIMEOUT_MS',
  'INTERNAL_EMAILS',
  'JWT_SECRET',
  'JWT_EXPIRY',
  'COOKIE_DOMAIN',
  'COOKIE_SECURE',
  'COOKIE_SAME_SITE',
  'RABBITMQ_URL',
  'RABBITMQ_QUEUE_CAPTURE',
  'RABBITMQ_QUEUE_EXPORT',
  'RABBITMQ_QUEUE_RENDER',
  'RABBITMQ_QUEUE_DEAD_LETTER',
  'CAPTURE_CONCURRENCY',
  'EXPORT_RETENTION_DAYS',
  'HERE_API_KEY',
  'HERE_TRAFFIC_FLOW_URL',
  'OSM_TILE_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_ACCESS_KEY_SECRET',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
  'R2_ENDPOINT',
  'PLAYWRIGHT_HEADLESS',
  'PLAYWRIGHT_TIMEOUT_MS',
  'PLAYWRIGHT_SCREENSHOT_WIDTH',
  'PLAYWRIGHT_SCREENSHOT_HEIGHT',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
  'SWAGGER_ENABLED',
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'RESEND_API_KEY',
  'MAILTRAP_API_TOKEN',
  'MAILTRAP_INBOX_ID',
] as const

/** Never returned, in any form. */
const SECRET_KEYS = new Set<string>(['DB_PASSWORD', 'JWT_SECRET', 'HERE_API_KEY', 'R2_ACCESS_KEY_ID', 'R2_ACCESS_KEY_SECRET', 'RESEND_API_KEY', 'MAILTRAP_API_TOKEN'])
/** URLs that can carry a password in their userinfo. */
const CREDENTIAL_URL_KEYS = new Set<string>(['DATABASE_URL', 'RABBITMQ_URL'])

export interface ConfigEntry {
  key: string
  /** The value as loaded, masked where needed. Null for secrets and unset keys. */
  value: string | null
  /** True when the environment sets it (otherwise the server's built-in default applies). */
  set: boolean
  secret: boolean
}

/** `amqp://guest:guest@rabbitmq:5672/` → `amqp://guest:****@rabbitmq:5672/` (ASCII: URL percent-encodes a bullet). */
export function maskUrlPassword(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.password) url.password = '****'
    return url.toString()
  } catch {
    // Not a parseable URL — hide it entirely rather than risk echoing a password.
    return '****'
  }
}

export function configSnapshot(env: NodeJS.ProcessEnv = process.env): ConfigEntry[] {
  return CONFIG_KEYS.map((key) => {
    const raw = env[key]
    const set = raw !== undefined && raw.trim() !== ''
    const secret = SECRET_KEYS.has(key)
    let value: string | null = null
    if (set && !secret) value = CREDENTIAL_URL_KEYS.has(key) ? maskUrlPassword(raw!) : raw!
    return { key, value, set, secret }
  })
}
