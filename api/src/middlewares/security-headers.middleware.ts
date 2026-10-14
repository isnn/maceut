import type { Request, Response, NextFunction } from 'express'

/**
 * Baseline response headers, without a library. The API answers JSON and files, never a
 * page, so the policy can be strict: nothing may frame it, browsers must not sniff a
 * download into something executable, and only the web app's site may embed its
 * responses (the web and API hosts share a site: maceut.com / api.maceut.com).
 * HSTS is set at Cloudflare, the TLS edge.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  next()
}
