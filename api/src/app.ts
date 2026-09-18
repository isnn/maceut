import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
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

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

mountSwagger(app)

app.use(routes)

// Order matters: unknown-route handler first, then the error formatter last of all.
app.use(notFoundHandler)
app.use(errorHandler)
