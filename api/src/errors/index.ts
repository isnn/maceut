/**
 * Typed application errors.
 *
 * Services throw these; `error-handler.middleware.ts` is the only place that turns
 * them into an HTTP response, so a service never needs to know about `res`. Codes and
 * statuses come from tech.md's error contract — keep them in sync with that table and
 * with `web/src/types/api.ts` on the frontend.
 */

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'PLAN_LIMIT_EXCEEDED'
  | 'SCHEDULE_LIMIT_EXCEEDED'
  | 'ZONE_NAME_TAKEN'
  | 'ROAD_CLASS_NOT_ALLOWED'
  | 'EMAIL_ALREADY_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'CAPTURE_FAILED'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.statusCode = statusCode
    this.details = details
    Error.captureStackTrace?.(this, new.target)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sesi tidak valid atau sudah berakhir.') {
    super('UNAUTHORIZED', 401, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Anda tidak punya akses ke resource ini.') {
    super('FORBIDDEN', 403, message)
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', 404, `${resource} tidak ditemukan.`)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Input tidak valid.', details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 422, message, details)
  }
}

/** BR-006 — daily capture limit. 429, per tech.md's table. */
export class PlanLimitExceededError extends AppError {
  constructor(limit: number) {
    super('PLAN_LIMIT_EXCEEDED', 429, `Anda telah mencapai batas ${limit} captures hari ini.`, { limit })
  }
}

/** BR-005 — max active schedules. */
export class ScheduleLimitExceededError extends AppError {
  constructor(limit: number) {
    super('SCHEDULE_LIMIT_EXCEEDED', 422, `Anda telah mencapai batas ${limit} schedule aktif.`, { limit })
  }
}

/** BR-015 — zone names are unique per user. */
export class ZoneNameTakenError extends AppError {
  constructor(name: string) {
    super('ZONE_NAME_TAKEN', 422, `Nama zona "${name}" sudah dipakai.`, { name })
  }
}

/** BR-021 — requested road class exceeds the plan's maximum. */
export class RoadClassNotAllowedError extends AppError {
  constructor(requested: string, maxAllowed: string) {
    super('ROAD_CLASS_NOT_ALLOWED', 403, `Kelas jalan "${requested}" tidak tersedia di paket Anda.`, {
      requested,
      maxAllowed,
    })
  }
}

export class EmailAlreadyTakenError extends AppError {
  constructor() {
    super('EMAIL_ALREADY_TAKEN', 422, 'Email ini sudah terdaftar.')
  }
}

/**
 * Deliberately says nothing about *which* half was wrong — F-09 requires that an
 * unknown email and a wrong password be indistinguishable, so the response cannot
 * be used to discover which emails have accounts.
 */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Email atau password salah.')
  }
}

export class CaptureFailedError extends AppError {
  constructor(message = 'Capture gagal diproses.') {
    super('CAPTURE_FAILED', 500, message)
  }
}

/** A third party (HERE, R2) failed or is unreachable — not our bug, and not a 500. */
export class UpstreamError extends AppError {
  constructor(service: string, message: string) {
    super('UPSTREAM_ERROR', 502, `${service}: ${message}`, { service })
  }
}
