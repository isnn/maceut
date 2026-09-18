import { app } from './app'
import { config, missingIntegrationKeys } from './config/env'
import { closeDb } from './lib/drizzle-client'
import { closeQueue } from './lib/rabbitmq-client'

const server = app.listen(config.port, () => {
  console.log(`[api] listening on :${config.port} (${config.nodeEnv})`)
  if (config.swaggerEnabled) console.log(`[api] swagger  ${config.appBaseUrl}/api-docs`)
  console.log(`[api] cors     ${config.frontendUrl}`)

  // R2 and HERE are optional at boot, which means an unconfigured one fails at the
  // first capture rather than at startup. Say so now, while someone is watching.
  const missing = missingIntegrationKeys()
  if (missing.r2.length) console.warn(`[api] R2 not configured — missing ${missing.r2.join(', ')}`)
  if (missing.here.length) console.warn(`[api] HERE not configured — missing ${missing.here.join(', ')}`)
  if (missing.r2.length || missing.here.length) console.warn('[api] run `npm run env:check` for details')
})

async function shutdown(signal: string) {
  console.log(`[api] ${signal} — shutting down`)
  server.close(async () => {
    await Promise.allSettled([closeDb(), closeQueue()])
    process.exit(0)
  })
  // Don't hang forever on a connection that refuses to drain.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
