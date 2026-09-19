import type { Request, Response, NextFunction } from 'express'
import { checkDb } from '../lib/drizzle-client'
import { checkQueue } from '../lib/rabbitmq-client'
import { config, isR2Configured, isHereConfigured } from '../config/env'
import { ok } from '../types/api'

/**
 * Reports the process and its dependencies.
 *
 * Returns 503 when a hard dependency is down so a load balancer or `docker compose`
 * healthcheck can act on it, but still answers with the full body — "which one is
 * down" is the entire point of asking. R2 and HERE are reported but never affect the
 * status code: they are optional at boot (see config/env.ts), and most endpoints work
 * without them.
 */
export async function health(_req: Request, res: Response, next: NextFunction) {
  try {
    const [db, queue] = await Promise.all([checkDb(), checkQueue()])
    const healthy = db.connected && queue.connected

    return res.status(healthy ? 200 : 503).json(
      ok({
        status: healthy ? 'ok' : 'degraded',
        env: config.nodeEnv,
        db,
        queue,
        integrations: {
          r2: isR2Configured() ? 'configured' : 'not_configured',
          here: isHereConfigured() ? 'configured' : 'not_configured',
        },
      }),
    )
  } catch (err) {
    next(err)
  }
}
