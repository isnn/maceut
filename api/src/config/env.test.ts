import { describe, it, expect } from 'vitest'
import { buildConfig, isR2Configured, isHereConfigured, missingIntegrationKeys, dropEmptyEnvEntries } from './env'

/** The minimum a process genuinely cannot start without. */
const base: NodeJS.ProcessEnv = {
  DB_HOST: 'postgres',
  DB_NAME: 'maceut_dev',
  DB_USER: 'postgres',
  DB_PASSWORD: 'sekret',
  JWT_SECRET: 'x'.repeat(32),
  RABBITMQ_URL: 'amqp://guest:guest@rabbitmq:5672/',
  FRONTEND_URL: 'http://localhost:3000',
}

describe('dropEmptyEnvEntries', () => {
  it('removes only the empty entries', () => {
    // docker compose's env_file injects KEY='' for every key in api/.env with no
    // value yet, and dotenv will not overwrite an entry that already exists. Without
    // this, a key you had just set in api/.env was reported MISSING until the
    // container restarted — sending you back to edit a file that was already right.
    const env = { EMPTY: '', REAL: 'value', ALSO_EMPTY: '' }
    const dropped = dropEmptyEnvEntries(env)

    expect(dropped.sort()).toEqual(['ALSO_EMPTY', 'EMPTY'])
    expect(env).toEqual({ REAL: 'value' })
  })

  it('leaves a genuinely provided override in place', () => {
    // `docker compose exec -e DB_HOST=x` and CI secrets must still win over the file.
    const env = { DB_HOST: 'override-me' }
    dropEmptyEnvEntries(env)
    expect(env.DB_HOST).toBe('override-me')
  })
})

describe('buildConfig', () => {
  it('accepts the minimum set and applies defaults', () => {
    const c = buildConfig(base)
    expect(c.port).toBe(8080)
    expect(c.nodeEnv).toBe('development')
    expect(c.swaggerEnabled).toBe(true)
    expect(c.renderBaseUrl).toBe('http://web:3000')
  })

  it('rejects a JWT_SECRET under 32 characters', () => {
    expect(() => buildConfig({ ...base, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET must be at least 32/)
  })

  it('names every offending key at once rather than failing on the first', () => {
    let message = ''
    try {
      buildConfig({ ...base, JWT_SECRET: 'short', DB_HOST: '', FRONTEND_URL: 'not-a-url' })
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('JWT_SECRET')
    expect(message).toContain('DB_HOST')
    expect(message).toContain('FRONTEND_URL')
  })

  it('treats a placeholder that dotenv resolves to an empty string as unset', () => {
    const c = buildConfig({ ...base, R2_BUCKET_NAME: '' })
    expect(c.r2BucketName).toBeUndefined()
    expect(isR2Configured(c)).toBe(false)
  })

  it('treats a bare inline comment as unset, the way Compose delivers it', () => {
    // Docker Compose's env_file strips `# comment` only when a value precedes it.
    // `R2_ACCOUNT_ID=   # <-- FILL ME` therefore arrives as the literal '# <-- FILL ME',
    // which would otherwise read as configured and fail much later, at upload time.
    const c = buildConfig({ ...base, R2_ACCOUNT_ID: '# <-- FILL ME', HERE_API_KEY: '# <-- FILL ME' })
    expect(c.r2AccountId).toBeUndefined()
    expect(c.r2Endpoint).toBeUndefined()
    expect(isHereConfigured(c)).toBe(false)
  })

  describe('database URL', () => {
    it('derives from the parts so DB_* stays the single source of truth', () => {
      const c = buildConfig(base)
      expect(c.databaseUrl).toBe('postgres://postgres:sekret@postgres:5432/maceut_dev')
    })

    it('percent-encodes credentials, so a password with @ or / does not corrupt the URL', () => {
      const c = buildConfig({ ...base, DB_PASSWORD: 'p@ss/w:rd' })
      expect(c.databaseUrl).toBe('postgres://postgres:p%40ss%2Fw%3Ard@postgres:5432/maceut_dev')
    })

    it('appends sslmode when required', () => {
      const c = buildConfig({ ...base, DB_SSLMODE: 'require' })
      expect(c.databaseUrl).toContain('?sslmode=require')
    })

    it('lets an explicit DATABASE_URL win, for managed databases', () => {
      const url = 'postgres://u:p@db.example.com:5432/x?sslmode=require&pool_timeout=0'
      expect(buildConfig({ ...base, DATABASE_URL: url }).databaseUrl).toBe(url)
    })
  })

  describe('R2 endpoint', () => {
    it('derives from the account id', () => {
      const c = buildConfig({ ...base, R2_ACCOUNT_ID: 'abc123' })
      expect(c.r2Endpoint).toBe('https://abc123.r2.cloudflarestorage.com')
    })

    it('is overridable for jurisdiction-bound buckets', () => {
      const c = buildConfig({ ...base, R2_ACCOUNT_ID: 'abc123', R2_ENDPOINT: 'https://abc123.eu.r2.cloudflarestorage.com' })
      expect(c.r2Endpoint).toBe('https://abc123.eu.r2.cloudflarestorage.com')
    })

    it('is undefined with no account id, rather than a malformed host', () => {
      expect(buildConfig(base).r2Endpoint).toBeUndefined()
    })
  })

  describe('optional integrations', () => {
    it('boots with neither R2 nor HERE configured', () => {
      const c = buildConfig(base)
      expect(isR2Configured(c)).toBe(false)
      expect(isHereConfigured(c)).toBe(false)
      expect(missingIntegrationKeys(c).r2).toHaveLength(4)
      expect(missingIntegrationKeys(c).here).toEqual(['HERE_API_KEY'])
    })

    it('reports R2 ready only when every part is present', () => {
      const partial = buildConfig({ ...base, R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b' })
      expect(isR2Configured(partial)).toBe(false)
      expect(missingIntegrationKeys(partial).r2).toEqual(['R2_ACCESS_KEY_SECRET', 'R2_BUCKET_NAME'])

      const full = buildConfig({
        ...base,
        R2_ACCOUNT_ID: 'a',
        R2_ACCESS_KEY_ID: 'b',
        R2_ACCESS_KEY_SECRET: 'c',
        R2_BUCKET_NAME: 'maceut-captures',
      })
      expect(isR2Configured(full)).toBe(true)
    })
  })

  it('coerces numeric and boolean env strings to real types', () => {
    const c = buildConfig({ ...base, PORT: '9000', SWAGGER_ENABLED: 'false', PLAYWRIGHT_TIMEOUT_MS: '45000' })
    expect(c.port).toBe(9000)
    expect(c.swaggerEnabled).toBe(false)
    expect(c.playwrightTimeoutMs).toBe(45_000)
  })
})
