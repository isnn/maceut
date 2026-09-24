import type { Plan } from './plan'

declare global {
  namespace Express {
    interface Request {
      /** Set by auth.middleware from the HttpOnly JWT cookie. */
      userId?: string
      /** Set by plan-check.middleware. Present only on routes that use it. */
      plan?: Plan
    }
  }
}

export {}
