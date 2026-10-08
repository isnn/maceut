import { describe, it, expect } from 'vitest'

/**
 * `setValue` is re-implemented here rather than imported, because env-set.ts runs
 * `main()` on import. The behaviour under test is the line-rewriting rule, which is
 * where a bug would silently corrupt api/.env.
 */
function setValue(contents: string, key: string, value: string): { next: string; found: boolean } {
  const lines = contents.split('\n')
  let found = false
  const next = lines.map((line) => {
    if (found) return line
    if (!new RegExp(`^${key}=`).test(line)) return line
    found = true
    return `${key}=${value}`
  })
  return { next: next.join('\n'), found }
}

const SAMPLE = [
  '# Cloudflare R2',
  '# TODO  dash.cloudflare.com -> R2 -> Overview',
  'R2_ACCOUNT_ID=',
  'R2_BUCKET_NAME=maceut-captures',
  '',
  '# HERE_API_KEY is mentioned in this comment',
  'HERE_API_KEY=old-value',
  'HERE_TRAFFIC_FLOW_URL=https://data.traffic.hereapi.com/v7/flow',
].join('\n')

describe('setValue', () => {
  it('replaces an empty value', () => {
    const { next, found } = setValue(SAMPLE, 'R2_ACCOUNT_ID', 'abc123')
    expect(found).toBe(true)
    expect(next).toContain('R2_ACCOUNT_ID=abc123')
  })

  it('replaces an existing value', () => {
    const { next } = setValue(SAMPLE, 'HERE_API_KEY', 'new-value')
    expect(next).toContain('HERE_API_KEY=new-value')
    expect(next).not.toContain('old-value')
  })

  it('keeps every comment and blank line', () => {
    // api/.env is mostly comments explaining each setting. A parse-and-rewrite
    // through dotenv would discard all of them.
    const { next } = setValue(SAMPLE, 'R2_ACCOUNT_ID', 'abc123')
    expect(next).toContain('# Cloudflare R2')
    expect(next).toContain('# TODO  dash.cloudflare.com -> R2 -> Overview')
    expect(next.split('\n')).toHaveLength(SAMPLE.split('\n').length)
  })

  it('does not touch a key mentioned inside a comment', () => {
    const { next } = setValue(SAMPLE, 'HERE_API_KEY', 'new-value')
    expect(next).toContain('# HERE_API_KEY is mentioned in this comment')
  })

  it('does not match a key that is a prefix of another', () => {
    // HERE_API_KEY must not rewrite HERE_TRAFFIC_FLOW_URL, and setting
    // HERE_TRAFFIC_FLOW_URL must not touch HERE_API_KEY.
    const { next } = setValue(SAMPLE, 'HERE_TRAFFIC_FLOW_URL', 'https://example.test')
    expect(next).toContain('HERE_API_KEY=old-value')
    expect(next).toContain('HERE_TRAFFIC_FLOW_URL=https://example.test')
  })

  it('reports when the key is absent instead of appending a stray line', () => {
    const { next, found } = setValue(SAMPLE, 'R2_ENDPOINT', 'https://x')
    expect(found).toBe(false)
    expect(next).toBe(SAMPLE)
  })

  it('rewrites only the first match', () => {
    const dupes = 'K=a\nK=b'
    expect(setValue(dupes, 'K', 'c').next).toBe('K=c\nK=b')
  })
})
