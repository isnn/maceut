import { ApiError } from '@/types/api'
import { NETWORK_ERROR } from '@/lib/api-client'
import type { Plan } from '@/features/auth/types'
import { PLAN_LIMITS } from '@/lib/constants'
import { planFor, type PlanIssue } from './plan-fit'
import type { CaptureInterval } from './types'

/** A field in the window dialog an error belongs under. */
export type WindowField = 'zone' | 'label' | 'start' | 'end' | 'interval' | 'days'

/**
 * What the window dialog shows for a failed save (FE-30) — always English, whatever the
 * API's message says, and always with the next step: a field to fix, a plan issue for
 * the upgrade panel, or one button.
 */
export type WindowError =
  | { kind: 'field'; field: WindowField; message: string }
  | { kind: 'plan'; issue: PlanIssue }
  | { kind: 'alert'; message: string; action: 'retry' | 'refresh' | 'close' | 'chooseZone' }

const ZOD_FIELD: Record<string, WindowField> = {
  zoneId: 'zone',
  label: 'label',
  start: 'start',
  end: 'end',
  interval: 'interval',
  days: 'days',
}

/** Field copy, shared with the dialog's own checks so both say the same thing. */
export const FIELD_COPY = {
  zone: 'Choose a zone.',
  label: 'Name this window.',
  labelLong: 'Too long — 120 characters max.',
  time: 'Use a time like 07:30.',
  order: 'Ends before it starts.',
  days: 'Pick at least one day.',
  daysBad: 'Those days didn’t save.',
  interval: 'Choose how often to collect.',
} as const

export function windowError(err: unknown, plan: Plan): WindowError {
  if (!(err instanceof ApiError)) return { kind: 'alert', message: 'Couldn’t save.', action: 'retry' }
  const details = (err.details ?? {}) as Record<string, unknown>

  switch (err.code) {
    case 'INTERVAL_NOT_IN_PLAN': {
      const interval = details.interval as CaptureInterval
      return { kind: 'plan', issue: { kind: 'interval', interval, needs: planFor(interval) } }
    }
    case 'SCHEDULE_LIMIT_EXCEEDED':
      return { kind: 'plan', issue: { kind: 'windows', limit: Number(details.limit ?? PLAN_LIMITS[plan].schedulesLimit) } }
    case 'CAPTURE_LIMIT_EXCEEDED':
      return {
        kind: 'plan',
        issue: { kind: 'daily', day: Number(details.day ?? 0), frames: Number(details.frames), limit: Number(details.dailyLimit) },
      }
    case 'VALIDATION_ERROR': {
      // Zod reports { field: message }; the service reports { field } with the message.
      if (typeof details.field === 'string') {
        const field = details.field as WindowField
        return { kind: 'field', field, message: field === 'end' ? FIELD_COPY.order : field === 'days' ? FIELD_COPY.daysBad : err.message }
      }
      const key = Object.keys(details).find((k) => k in ZOD_FIELD)
      if (key) {
        const field = ZOD_FIELD[key]!
        const copy: Record<WindowField, string> = {
          zone: FIELD_COPY.zone,
          label: String(details[key]).includes('120') ? FIELD_COPY.labelLong : FIELD_COPY.label,
          start: FIELD_COPY.time,
          end: FIELD_COPY.time,
          interval: FIELD_COPY.interval,
          days: FIELD_COPY.days,
        }
        return { kind: 'field', field, message: copy[field] }
      }
      return { kind: 'alert', message: 'Nothing to save yet.', action: 'close' }
    }
    case 'NOT_FOUND':
      // The service names the resource (`Zona` / `Zone` / `Window`).
      return /^zon/i.test(String(details.resource ?? ''))
        ? { kind: 'alert', message: 'That zone was deleted.', action: 'chooseZone' }
        : { kind: 'alert', message: 'This window was deleted.', action: 'refresh' }
    case 'FORBIDDEN':
      return { kind: 'alert', message: 'You can’t edit this window.', action: 'close' }
    case NETWORK_ERROR:
      return { kind: 'alert', message: 'You’re offline or Maceut is unreachable.', action: 'retry' }
    default:
      return { kind: 'alert', message: 'Couldn’t save.', action: 'retry' }
  }
}
