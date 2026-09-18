// TODO: replace with real fetch through @/lib/api-client once api/ exists
// (GET /internal/config, PATCH /internal/config/:key, POST /internal/config/:key/rotate).
//
// Secrets are write-only by construction: rotateSecret() derives the mask and
// throws the plaintext away, so no secret value is ever persisted here. A real
// GET /internal/config would return exactly this shape — { isSet, last4 } and
// never the value — so swapping the mock out is plumbing, not a contract change.

import { CONFIG_VARS } from './catalog'

const VALUES_KEY = 'maceut_mock_config_values'
const SECRETS_KEY = 'maceut_mock_config_secrets'
const MOCK_LATENCY_MS = 300

export type ConfigPrimitive = string | number | boolean

export interface ConfigValue {
  key: string
  value: ConfigPrimitive
  updatedAt: string
  updatedBy: string
}

export interface SecretMeta {
  key: string
  isSet: boolean
  /** Last four characters of the value, for recognition only. */
  last4: string
  updatedAt: string | null
  updatedBy: string | null
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

function readValues(): Record<string, ConfigValue> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(VALUES_KEY)
  return raw ? (JSON.parse(raw) as Record<string, ConfigValue>) : {}
}

function readSecrets(): Record<string, SecretMeta> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(SECRETS_KEY)
  return raw ? (JSON.parse(raw) as Record<string, SecretMeta>) : {}
}

export async function getConfigState(): Promise<{ values: Record<string, ConfigValue>; secrets: Record<string, SecretMeta> }> {
  const values = readValues()
  const secrets = readSecrets()

  // Every catalog secret reports a state, even if it has never been set.
  for (const meta of CONFIG_VARS) {
    if (meta.secret && !secrets[meta.key]) {
      secrets[meta.key] = { key: meta.key, isSet: false, last4: '', updatedAt: null, updatedBy: null }
    }
  }
  return delay({ values, secrets })
}

export async function updateConfigValue(key: string, value: ConfigPrimitive, updatedBy: string): Promise<ConfigValue> {
  const meta = CONFIG_VARS.find((v) => v.key === key)
  if (meta?.secret) throw new Error(`${key} is a secret — use rotateSecret()`)

  const values = readValues()
  const entry: ConfigValue = { key, value, updatedAt: new Date().toISOString(), updatedBy }
  values[key] = entry
  window.localStorage.setItem(VALUES_KEY, JSON.stringify(values))
  return delay(entry)
}

/**
 * Takes a plaintext secret, keeps only enough to recognise it later, and drops
 * the rest on the floor. Nothing sensitive reaches localStorage.
 */
export async function rotateSecret(key: string, plaintext: string, updatedBy: string): Promise<SecretMeta> {
  const secrets = readSecrets()
  const trimmed = plaintext.trim()
  const meta: SecretMeta = {
    key,
    isSet: trimmed.length > 0,
    last4: trimmed.slice(-4),
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  secrets[key] = meta
  window.localStorage.setItem(SECRETS_KEY, JSON.stringify(secrets))
  return delay(meta)
}

/** How many editable secrets still have no value — surfaced on the overview. */
export async function countUnsetSecrets(): Promise<number> {
  const { secrets } = await getConfigState()
  return CONFIG_VARS.filter((v) => v.secret && !secrets[v.key]?.isSet).length
}
