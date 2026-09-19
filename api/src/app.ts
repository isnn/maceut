import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './lib/auth'
import routes from './routes'
import { mountSwagger } from './lib/swagger'
import { errorHandler, notFoundHandler } from './middlewares/error-handler.middleware'
import { config } from './config/env'

/**
 * Builds the Express app without listening — `server.ts` does that.
 *
 * Keeping the two apart is what lets supertest mount the app directly, so controller
 * tests need no port and no teardown (tech.md's test pattern assumes this export).
 */
export const app = express()

app.disable('x-powered-by')

/**
 * CORS is deliberately a single exact origin rather than a reflected one.
 *
 * Auth rides on an HttpOnly cookie, so requests are credentialed, and the spec
 * forbids pairing `credentials: true` with a wildcard. FRONTEND_URL must therefore
 * match the address bar exactly — scheme, host and port. It is *not* the URL
 * Playwright uses to reach the render page; that is RENDER_BASE_URL (ADR-017).
 */
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
)

/**
 * Better Auth owns everything under /api/auth (ADR-009) and answers in its own
 * response shapes rather than this API's `{ success, data }` envelope — a deliberate
 * split, so its client library works unmodified.
 *
 * This MUST be mounted before express.json(): Better Auth reads the raw request
 * stream itself, and a body parser that has already consumed it leaves the handler
 * hanging on requests that never resolve.
 */
// '/api/auth/*' is Express 4 wildcard syntax. Express 5 renamed it to '*splat';
// on 4.x that form matches nothing and every auth request falls through to our
// 404 handler instead.
app.all('/api/auth/*', toNodeHandler(auth))

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

mountSwagger(app)

app.use(routes)

// Order matters: unknown-route handler first, then the error formatter last of all.
app.use(notFoundHandler)
app.use(errorHandler)
