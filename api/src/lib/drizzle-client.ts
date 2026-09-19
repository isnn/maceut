import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { config } from '../config/env'

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: config.dbPoolIdleTimeoutMs,
  ssl: config.dbSslMode === 'require' ? { rejectUnauthorized: false } : undefined,
})

// A pool error with no listener crashes the process. Idle clients get dropped by
// restarts and network blips routinely, and the pool recovers on its own.
pool.on('error', (err) => {
  console.error('[postgres] idle client error:', err.message)
})

export const db = drizzle(pool)

export interface DbHealth {
  connected: boolean
  version?: string
  postgis?: string
  error?: string
}

/**
 * Checks the connection *and* that PostGIS is installed. Postgres answering is not
 * enough here: zones are `geometry(Polygon, 4326)` and every spatial query needs the
 * extension, so a healthy-looking database without PostGIS would fail at the first
 * zone insert rather than at startup.
 */
export async function checkDb(): Promise<DbHealth> {
  try {
    const versionRes = await db.execute(sql`SELECT version() AS version`)
    const version = String((versionRes.rows[0] as { version?: string })?.version ?? '')

    const postgisRes = await db.execute(
      sql`SELECT extversion FROM pg_extension WHERE extname = 'postgis'`,
    )
    const postgis = (postgisRes.rows[0] as { extversion?: string } | undefined)?.extversion

    return {
      connected: true,
      // "PostgreSQL 16.4 on x86_64-pc-linux-musl, compiled by ..." — first two words is plenty.
      version: version.split(' ').slice(0, 2).join(' '),
      postgis,
    }
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function closeDb(): Promise<void> {
  await pool.end()
}
