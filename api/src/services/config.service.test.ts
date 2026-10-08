import { describe, it, expect } from 'vitest'
import { configSnapshot, maskUrlPassword } from './config.service'

describe('configSnapshot', () => {
  const env = {
    NODE_ENV: 'production',
    JWT_SECRET: 'super-secret-signing-key',
    HERE_API_KEY: 'here-key-123',
    R2_ACCESS_KEY_SECRET: 'r2-secret',
    DATABASE_URL: 'postgres://app:db-pass@postgres:5432/maceut',
    RABBITMQ_URL: 'amqp://guest:guest@rabbitmq:5672/',
    INTERNAL_EMAILS: 'admin@maceut.id',
  }

  it('never returns a secret — only that it is set', () => {
    const snapshot = configSnapshot(env)
    const json = JSON.stringify(snapshot)
    for (const leaked of ['super-secret-signing-key', 'here-key-123', 'r2-secret', 'db-pass']) {
      expect(json).not.toContain(leaked)
    }
    expect(snapshot.find((e) => e.key === 'JWT_SECRET')).toEqual({ key: 'JWT_SECRET', value: null, set: true, secret: true })
  })

  it('masks the password inside connection URLs', () => {
    const snapshot = configSnapshot(env)
    expect(snapshot.find((e) => e.key === 'DATABASE_URL')?.value).toBe('postgres://app:****@postgres:5432/maceut')
    expect(snapshot.find((e) => e.key === 'RABBITMQ_URL')?.value).toBe('amqp://guest:****@rabbitmq:5672/')
  })

  it('reports unset keys as unset, so the page can show the default applies', () => {
    const entry = configSnapshot(env).find((e) => e.key === 'R2_PUBLIC_URL')
    expect(entry).toEqual({ key: 'R2_PUBLIC_URL', value: null, set: false, secret: false })
  })

  it('shows ordinary values as they were loaded', () => {
    expect(configSnapshot(env).find((e) => e.key === 'INTERNAL_EMAILS')?.value).toBe('admin@maceut.id')
  })
})

describe('maskUrlPassword', () => {
  it('hides an unparseable value entirely rather than risk echoing a password', () => {
    expect(maskUrlPassword('not a url with pass')).toBe('****')
  })
})
