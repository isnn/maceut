/**
 * Labels and help for the server configuration shown on /internal/config.
 *
 * The VALUES come from the API (GET /internal/config), which reads the running
 * server's environment — this file only says how to present each key. Keys match
 * `CONFIG_KEYS` in api/src/services/config.service.ts; a key the API returns that is
 * missing here still renders, under "Other", with its raw name.
 *
 * Read-only by design (ADR-018): values change by editing api/.env and restarting.
 */

export type ConfigGroupId = 'integrations' | 'storage' | 'auth' | 'queue' | 'capture_engine' | 'server' | 'database'

export interface ConfigGroupMeta {
  id: ConfigGroupId
  title: string
  description: string
}

export interface ConfigVarMeta {
  key: string
  group: ConfigGroupId
  label: string
  help?: string
  /** What the server uses when the environment doesn't set it. */
  defaultValue?: string
}

export const CONFIG_GROUPS: ConfigGroupMeta[] = [
  { id: 'integrations', title: 'Map data', description: 'HERE supplies the traffic; OpenStreetMap the basemap (ADR-010b).' },
  { id: 'storage', title: 'Cloudflare R2', description: 'Where capture images and Studio exports are stored.' },
  { id: 'auth', title: 'Authentication & staff access', description: 'Session signing and lifetime, and who is staff.' },
  { id: 'queue', title: 'Queue & workers', description: 'RabbitMQ, and how the worker takes jobs.' },
  { id: 'capture_engine', title: 'Render engine', description: 'The headless Chromium that renders images and exports.' },
  { id: 'server', title: 'Server', description: 'Where the API runs and who may call it.' },
  { id: 'database', title: 'Database', description: 'PostgreSQL + PostGIS.' },
]

export const CONFIG_VARS: ConfigVarMeta[] = [
  { key: 'HERE_API_KEY', group: 'integrations', label: 'HERE API key', help: 'Server-side only; the browser never receives it.' },
  { key: 'HERE_TRAFFIC_FLOW_URL', group: 'integrations', label: 'HERE traffic flow endpoint', defaultValue: 'https://data.traffic.hereapi.com/v7/flow' },
  { key: 'OSM_TILE_URL', group: 'integrations', label: 'OSM tile URL template', defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },

  { key: 'R2_ACCOUNT_ID', group: 'storage', label: 'Account ID' },
  { key: 'R2_BUCKET_NAME', group: 'storage', label: 'Bucket name' },
  { key: 'R2_PUBLIC_URL', group: 'storage', label: 'Public URL', help: 'Or a custom domain in front of the bucket.' },
  { key: 'R2_ACCESS_KEY_ID', group: 'storage', label: 'Access key ID' },
  { key: 'R2_ACCESS_KEY_SECRET', group: 'storage', label: 'Access key secret' },
  { key: 'R2_ENDPOINT', group: 'storage', label: 'Endpoint override', help: 'Normally derived from the account ID.' },

  { key: 'JWT_SECRET', group: 'auth', label: 'Session signing secret' },
  { key: 'JWT_EXPIRY', group: 'auth', label: 'Session lifetime', defaultValue: '7d' },
  {
    key: 'INTERNAL_EMAILS',
    group: 'auth',
    label: 'Staff emails',
    help: 'These accounts are always staff and can’t be demoted in the app (BR-027).',
  },
  { key: 'COOKIE_DOMAIN', group: 'auth', label: 'Cookie domain', defaultValue: 'localhost' },
  { key: 'COOKIE_SECURE', group: 'auth', label: 'Secure cookies', defaultValue: 'false' },
  { key: 'COOKIE_SAME_SITE', group: 'auth', label: 'Cookie SameSite', defaultValue: 'lax' },

  { key: 'RABBITMQ_URL', group: 'queue', label: 'RabbitMQ URL' },
  { key: 'RABBITMQ_QUEUE_CAPTURE', group: 'queue', label: 'Capture queue', defaultValue: 'capture-jobs' },
  { key: 'RABBITMQ_QUEUE_EXPORT', group: 'queue', label: 'Export queue', defaultValue: 'export-jobs' },
  { key: 'RABBITMQ_QUEUE_DEAD_LETTER', group: 'queue', label: 'Dead-letter queue', defaultValue: 'capture-dead-letter' },
  { key: 'CAPTURE_CONCURRENCY', group: 'queue', label: 'Captures at once', defaultValue: '4' },
  { key: 'EXPORT_RETENTION_DAYS', group: 'queue', label: 'Export file retention (days)', defaultValue: '7' },

  { key: 'PLAYWRIGHT_HEADLESS', group: 'capture_engine', label: 'Headless', defaultValue: 'true' },
  { key: 'PLAYWRIGHT_TIMEOUT_MS', group: 'capture_engine', label: 'Timeout (ms)', defaultValue: '30000' },
  { key: 'PLAYWRIGHT_SCREENSHOT_WIDTH', group: 'capture_engine', label: 'Capture image width', defaultValue: '1280' },
  { key: 'PLAYWRIGHT_SCREENSHOT_HEIGHT', group: 'capture_engine', label: 'Capture image height', defaultValue: '720' },
  { key: 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH', group: 'capture_engine', label: 'Chromium path' },
  {
    key: 'RENDER_BASE_URL',
    group: 'capture_engine',
    label: 'Render page base URL',
    help: 'Where the worker opens the render page — the compose service name, not localhost.',
    defaultValue: 'http://web:3000',
  },

  { key: 'NODE_ENV', group: 'server', label: 'Environment', defaultValue: 'development' },
  { key: 'PORT', group: 'server', label: 'Port', defaultValue: '8080' },
  { key: 'APP_BASE_URL', group: 'server', label: 'API base URL', defaultValue: 'http://localhost:8080' },
  { key: 'FRONTEND_URL', group: 'server', label: 'Allowed browser origin (CORS)' },
  { key: 'SWAGGER_ENABLED', group: 'server', label: 'Swagger UI at /api-docs', defaultValue: 'true' },

  { key: 'DB_HOST', group: 'database', label: 'Host' },
  { key: 'DB_PORT', group: 'database', label: 'Port', defaultValue: '5432' },
  { key: 'DB_NAME', group: 'database', label: 'Database' },
  { key: 'DB_USER', group: 'database', label: 'User' },
  { key: 'DB_PASSWORD', group: 'database', label: 'Password' },
  { key: 'DB_SSLMODE', group: 'database', label: 'SSL mode' },
  { key: 'DATABASE_URL', group: 'database', label: 'Connection URL', help: 'Overrides the DB_* fields when set.' },
  { key: 'DB_POOL_MAX', group: 'database', label: 'Pool size' },
  { key: 'DB_POOL_IDLE_TIMEOUT_MS', group: 'database', label: 'Pool idle timeout (ms)' },
]

export const VAR_BY_KEY = new Map(CONFIG_VARS.map((v) => [v.key, v]))
