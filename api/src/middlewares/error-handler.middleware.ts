import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError, NotFoundError } from '../errors'
import type { ErrorResponse } from '../types/api'
import { config } from '../config/env'

/**
 * The only place an error becomes an HTTP response.
 *
 * Controllers call `next(err)`; services just throw. Anything that is not an
 * `AppError` is a bug, so it is logged in full and answered with a generic 500 —
 * an unexpected error's message can carry internals (a query, a file path, a
 * connection string) and must not reach the client.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    console.warn(`[VALIDATION_ERROR] ${req.method} ${req.originalUrl} — ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)

    const details: Record<string, string> = {}
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_'
      // First message per field: forms show one error per input.
      if (!(key in details)) details[key] = issue.message
    }
    const body: ErrorResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid.', details },
    }
    return res.status(422).json(body)
  }

  if (err instanceof AppError) {
    // Refusals were returned silently, so a 422 reaching the browser named no route and
    // there was nothing in the logs to match it against — a client-side
    // "Input tidak valid" with no way to find out which request produced it. Logged at
    // one line: enough to locate, not enough to bury real crashes.
    console.warn(`[${err.code}] ${req.method} ${req.originalUrl} — ${err.message}`)

    const body: ErrorResponse = {
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    }
    return res.status(err.statusCode).json(body)
  }

  // body-parser rejects unparseable or oversized bodies before any route runs. These
  // are bad requests, not server bugs — answering 500 and logging a stack would both
  // be wrong, and would bury real crashes in noise.
  const parseError = err as { type?: string; statusCode?: number }
  if (parseError?.type === 'entity.parse.failed') {
    const body: ErrorResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Body request bukan JSON yang valid.' },
    }
    return res.status(422).json(body)
  }
  if (parseError?.type === 'entity.too.large') {
    const body: ErrorResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Body request terlalu besar.' },
    }
    return res.status(413).json(body)
  }

  console.error('[unhandled]', err)
  const body: ErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan pada server.',
      // Only outside production, and only the message — never the stack.
      ...(config.isProduction ? {} : { details: { hint: err instanceof Error ? err.message : String(err) } }),
    },
  }
  return res.status(500).json(body)
}

/** Unknown routes answer in the same envelope as everything else, not Express's HTML page. */
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError('Endpoint'))
}
