import { ApiError, type ApiResponse } from '@/types/api'

/**
 * The single place the browser talks to api/.
 *
 * Two shapes live here on purpose (ADR-016). Application endpoints answer
 * `{ success, data }` and go through `apiClient`. Better Auth owns `/api/auth/*` and
 * answers in its own shape, so it gets `authClient` instead — wrapping it would mean
 * maintaining an adapter per endpoint for no gain.
 *
 * Both send `credentials: 'include'`, because the session is an HttpOnly cookie and
 * the API is a different origin from the app (:8080 vs :3001). Without it the cookie
 * is neither sent nor stored, and every request looks signed-out.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080'

/** A failure that never reached the API — DNS, connection refused, CORS, offline. */
export const NETWORK_ERROR = 'NETWORK_ERROR'

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // A proxy error page or a crash before the JSON handler. Surfacing the status is
    // more use than "Unexpected token < in JSON".
    throw new ApiError({
      code: 'BAD_RESPONSE',
      message: `Server returned a non-JSON response (HTTP ${res.status}).`,
    })
  }
}

/** Pages a signed-out visitor is meant to be on — a 401 there is expected, not an expiry. */
const PUBLIC_AUTH_PATHS = ['/login', '/register', '/forgot-password', '/verify-email']
let redirectingToLogin = false

/**
 * The session ended while a page was open (FE-30). The app's guard only checks on load,
 * so without this every later call failed with a small "session ended" line and nothing
 * else happened. Go to login once — parallel calls all land here — and never settle, so
 * the page doesn't flash an error on its way out. `/me` is left alone: it answers "signed
 * out" by design, and the guard redirects on that.
 */
function sessionEnded(): Promise<never> {
  const here = typeof window === 'undefined' ? null : window.location.pathname
  if (here === null || PUBLIC_AUTH_PATHS.some((p) => here.startsWith(p))) {
    return Promise.reject(new ApiError({ code: 'UNAUTHORIZED', message: 'Your session has ended. Please log in again.' }))
  }
  if (!redirectingToLogin) {
    redirectingToLogin = true
    const back = window.location.pathname + window.location.search
    window.location.replace(`/login?redirect=${encodeURIComponent(back)}&expired=1`)
  }
  return new Promise<never>(() => undefined)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    })
  } catch {
    throw new ApiError({
      code: NETWORK_ERROR,
      message: 'Could not reach the server. Check your connection and try again.',
    })
  }

  const body = (await parseJson(res)) as ApiResponse<T> | null

  if (!body || typeof body !== 'object' || !('success' in body)) {
    throw new ApiError({ code: 'BAD_RESPONSE', message: `Unexpected response from the server (HTTP ${res.status}).` })
  }
  if (!body.success) {
    if (res.status === 401 && body.error.code === 'UNAUTHORIZED' && path !== '/me') return sessionEnded()
    throw new ApiError(body.error)
  }
  return body.data
}

/** Like `request`, but keeps `meta` — used by the paginated internal directory. */
async function requestWithMeta<T>(path: string): Promise<{ data: T; meta?: ApiResponse<T> extends { meta?: infer M } ? M : never }> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    throw new ApiError({ code: NETWORK_ERROR, message: 'Could not reach the server. Check your connection and try again.' })
  }

  const body = (await parseJson(res)) as ApiResponse<T>
  if (!body || !('success' in body)) {
    throw new ApiError({ code: 'BAD_RESPONSE', message: `Unexpected response from the server (HTTP ${res.status}).` })
  }
  if (!body.success) {
    if (res.status === 401 && body.error.code === 'UNAUTHORIZED') return sessionEnded()
    throw new ApiError(body.error)
  }
  return { data: body.data, meta: body.meta as never }
}

/**
 * A file the API sends as an attachment (FE-30: the captures CSV). Errors still arrive
 * as `{ success: false, error }`, and an ended session still goes to login.
 */
async function download(path: string): Promise<{ blob: Blob; filename: string | null; headers: Headers }> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' })
  } catch {
    throw new ApiError({ code: NETWORK_ERROR, message: 'Could not reach the server. Check your connection and try again.' })
  }
  if (!res.ok) {
    const body = (await parseJson(res)) as ApiResponse<unknown> | null
    if (body && typeof body === 'object' && 'success' in body && !body.success) {
      if (res.status === 401 && body.error.code === 'UNAUTHORIZED') return sessionEnded()
      throw new ApiError(body.error)
    }
    throw new ApiError({ code: 'BAD_RESPONSE', message: `Unexpected response from the server (HTTP ${res.status}).` })
  }
  const filename = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? null
  return { blob: await res.blob(), filename, headers: res.headers }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  download,
  getWithMeta: requestWithMeta,
  post: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'POST', body: payload ? JSON.stringify(payload) : undefined }),
  patch: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'PATCH', body: payload ? JSON.stringify(payload) : undefined }),
  put: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: 'PUT', body: payload ? JSON.stringify(payload) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// --- Better Auth ---------------------------------------------------------------

/** Better Auth's error body. Its codes are SCREAMING_SNAKE, like ours. */
interface BetterAuthError {
  message?: string
  code?: string
}

/**
 * Calls a Better Auth endpoint and normalises its failures into `ApiError`, so
 * callers catch one error type across the whole app even though the two modules
 * answer in different shapes.
 *
 * Called with plain fetch rather than `better-auth`'s client package: these are four
 * simple JSON posts, and adding a dependency to web/ needs explicit approval per
 * CLAUDE.md. If reactive session state is wanted later, `better-auth/react`'s
 * `createAuthClient` is the upgrade path.
 */
export async function authRequest<T>(path: string, payload?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/auth${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    })
  } catch {
    throw new ApiError({ code: NETWORK_ERROR, message: 'Could not reach the server. Check your connection and try again.' })
  }

  const body = await parseJson(res)

  if (!res.ok) {
    const err = (body ?? {}) as BetterAuthError
    throw new ApiError({
      code: err.code ?? 'AUTH_ERROR',
      message: err.message ?? `Sign-in failed (HTTP ${res.status}).`,
    })
  }
  return body as T
}
