// The system configuration surface, transcribed from api/.env.example and
// web/.env.example. Keys match the environment variable names 1:1, so a real
// backend can map these straight onto its zod-validated config object.

export type ConfigGroupId =
  | 'here'
  | 'osm'
  | 'storage'
  | 'capture_engine'
  | 'auth'
  | 'feature_flags'
  | 'server'
  | 'database'
  | 'queue'
  | 'frontend'

export interface ConfigGroupMeta {
  id: ConfigGroupId
  title: string
  description: string
  /** Deploy-time infrastructure is shown but never editable from a web UI. */
  editable: boolean
}

export interface ConfigVarMeta {
  key: string
  group: ConfigGroupId
  label: string
  help?: string
  type: 'string' | 'url' | 'number' | 'boolean'
  secret?: boolean
  /** Change takes effect only after the service restarts. */
  requiresRestart?: boolean
  /** Shown when nothing has been set through this screen. */
  defaultValue?: string | number | boolean
  /** Extra copy on the rotate dialog for unusually destructive keys. */
  rotateWarning?: string
}

export const CONFIG_GROUPS: ConfigGroupMeta[] = [
  { id: 'here', title: 'HERE Traffic', description: 'Traffic flow data source. Basemap tiles come from OpenStreetMap (ADR-010b).', editable: true },
  { id: 'osm', title: 'OpenStreetMap', description: 'Basemap tiles, used in the browser and by the Playwright render page.', editable: true },
  { id: 'storage', title: 'Cloudflare R2', description: 'Where captures and branding logos are stored.', editable: true },
  { id: 'capture_engine', title: 'Capture engine', description: 'Playwright screenshot behaviour.', editable: true },
  { id: 'auth', title: 'Authentication', description: 'Session signing and lifetime.', editable: true },
  { id: 'feature_flags', title: 'Feature flags', description: 'Toggles that change behaviour without a code change.', editable: true },
  { id: 'server', title: 'Server', description: 'Set at deploy time — not editable from this screen.', editable: false },
  { id: 'database', title: 'Database', description: 'Set at deploy time — not editable from this screen.', editable: false },
  { id: 'queue', title: 'RabbitMQ', description: 'Set at deploy time — not editable from this screen.', editable: false },
  { id: 'frontend', title: 'Frontend & CORS', description: 'Set at deploy time — not editable from this screen.', editable: false },
]

export const CONFIG_VARS: ConfigVarMeta[] = [
  // HERE
  {
    key: 'HERE_API_KEY',
    group: 'here',
    label: 'HERE API key',
    help: 'Server-side only — the browser never receives it; traffic is proxied through GET /traffic/preview.',
    type: 'string',
    secret: true,
    requiresRestart: true,
  },
  { key: 'HERE_TRAFFIC_FLOW_URL', group: 'here', label: 'Traffic flow endpoint', type: 'url', defaultValue: 'https://data.traffic.hereapi.com/v7/flow' },

  // OSM
  { key: 'OSM_TILE_URL', group: 'osm', label: 'Tile URL template', type: 'url', defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },

  // R2
  { key: 'R2_ACCOUNT_ID', group: 'storage', label: 'Account ID', type: 'string' },
  { key: 'R2_BUCKET_NAME', group: 'storage', label: 'Bucket name', type: 'string', defaultValue: 'maceut-captures' },
  { key: 'R2_PUBLIC_URL', group: 'storage', label: 'Public URL', type: 'url', help: 'Or a custom domain in front of the bucket.' },
  { key: 'R2_ACCESS_KEY_ID', group: 'storage', label: 'Access key ID', type: 'string', secret: true, requiresRestart: true },
  { key: 'R2_ACCESS_KEY_SECRET', group: 'storage', label: 'Access key secret', type: 'string', secret: true, requiresRestart: true },

  // Playwright
  { key: 'PLAYWRIGHT_HEADLESS', group: 'capture_engine', label: 'Headless', type: 'boolean', defaultValue: true },
  { key: 'PLAYWRIGHT_TIMEOUT_MS', group: 'capture_engine', label: 'Timeout (ms)', type: 'number', defaultValue: 30000 },
  { key: 'PLAYWRIGHT_SCREENSHOT_WIDTH', group: 'capture_engine', label: 'Screenshot width', type: 'number', defaultValue: 1280 },
  { key: 'PLAYWRIGHT_SCREENSHOT_HEIGHT', group: 'capture_engine', label: 'Screenshot height', type: 'number', defaultValue: 720 },

  // Auth
  {
    key: 'JWT_SECRET',
    group: 'auth',
    label: 'JWT signing secret',
    type: 'string',
    secret: true,
    requiresRestart: true,
    rotateWarning: 'Rotating this signs out every user immediately — every existing session token stops validating.',
  },
  { key: 'JWT_EXPIRY', group: 'auth', label: 'Session lifetime', type: 'string', defaultValue: '7d', help: 'Duration string, e.g. 7d or 12h.' },

  // Flags
  { key: 'SWAGGER_ENABLED', group: 'feature_flags', label: 'Swagger UI at /api-docs', type: 'boolean', defaultValue: true, requiresRestart: true },
  {
    key: 'NEXT_PUBLIC_ENABLE_MOCK_CAPTURE',
    group: 'feature_flags',
    label: 'Mock capture',
    help: 'Skips Playwright and returns a dummy image.',
    type: 'boolean',
    defaultValue: false,
    requiresRestart: true,
  },

  // Read-only infrastructure
  { key: 'NODE_ENV', group: 'server', label: 'Environment', type: 'string', defaultValue: 'development' },
  { key: 'PORT', group: 'server', label: 'Port', type: 'number', defaultValue: 8080 },
  { key: 'APP_BASE_URL', group: 'server', label: 'App base URL', type: 'url', defaultValue: 'http://localhost:8080' },
  { key: 'DB_HOST', group: 'database', label: 'Host', type: 'string', defaultValue: 'postgres' },
  { key: 'DB_PORT', group: 'database', label: 'Port', type: 'number', defaultValue: 5432 },
  { key: 'DB_NAME', group: 'database', label: 'Database', type: 'string', defaultValue: 'maceut_dev' },
  { key: 'DB_USER', group: 'database', label: 'User', type: 'string', defaultValue: 'postgres' },
  { key: 'DB_PASSWORD', group: 'database', label: 'Password', type: 'string', secret: true },
  { key: 'DATABASE_URL', group: 'database', label: 'Connection URL', type: 'string', secret: true },
  { key: 'RABBITMQ_URL', group: 'queue', label: 'Connection URL', type: 'string', defaultValue: 'amqp://guest:guest@rabbitmq:5672/' },
  { key: 'RABBITMQ_QUEUE_CAPTURE', group: 'queue', label: 'Capture queue', type: 'string', defaultValue: 'capture-jobs' },
  { key: 'RABBITMQ_QUEUE_DEAD_LETTER', group: 'queue', label: 'Dead-letter queue', type: 'string', defaultValue: 'capture-dead-letter' },
  { key: 'FRONTEND_URL', group: 'frontend', label: 'Allowed origin', type: 'url', defaultValue: 'http://localhost:3000' },
]

export function varsInGroup(group: ConfigGroupId): ConfigVarMeta[] {
  return CONFIG_VARS.filter((v) => v.group === group)
}
