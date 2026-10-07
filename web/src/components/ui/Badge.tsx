import { PLAN_LABEL, ROAD_CLASS_LABEL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { RoadClass } from '@/features/zones/types'
import type { Plan } from '@/features/auth/types'

export type PillTone = 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'teal' | 'neutral'

const PILL_TONE: Record<PillTone, string> = {
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-danger-bg text-danger-text',
  brand: 'bg-primary-soft text-primary',
  info: 'bg-info-bg text-info',
  teal: 'bg-teal-bg text-teal-text',
  neutral: 'bg-canvas-secondary text-text-secondary',
}

/**
 * The one label shape: a tinted pill. Zone, capture window, capture and export statuses,
 * and categories (road class, plan, role), all use it, so they look the same wherever
 * they appear. No dot: the tint already carries the colour, and a dot on every label
 * crowded tables and sat off-centre in tight cells. `pulse` gently pulses a label for
 * something still in progress.
 */
export function StatusPill({
  tone,
  pulse = false,
  title,
  className,
  children,
}: {
  tone: PillTone
  pulse?: boolean
  title?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center text-micro font-semibold rounded-full px-sm py-xs whitespace-nowrap tabular-nums',
        PILL_TONE[tone],
        pulse && 'animate-pulse',
        className,
      )}
    >
      {children}
    </span>
  )
}

// --- category labels, on the same pill -------------------------------------------------
// Categories use teal, blue and purple — green, amber and red stay reserved for states
// (running, needs attention, failed), so a label never reads as a status. Road classes
// get a colour each, grey included none: grey read as "disabled" beside the others.

const ROAD_CLASS_TONE: Record<RoadClass, PillTone> = {
  nasional: 'teal',
  nasional_provinsi: 'info',
  semua: 'brand',
}

/** The road class a zone collects (BR-021). */
export function RoadClassBadge({ roadClass, className }: { roadClass: RoadClass; className?: string }) {
  return (
    <StatusPill tone={ROAD_CLASS_TONE[roadClass]} className={className}>
      {ROAD_CLASS_LABEL[roadClass]}
    </StatusPill>
  )
}

const PLAN_TONE: Record<Plan, PillTone> = { free: 'neutral', standard: 'info', premium: 'brand' }

export function PlanPill({ plan, className }: { plan: Plan; className?: string }) {
  return (
    <StatusPill tone={PLAN_TONE[plan]} className={className}>
      {PLAN_LABEL[plan]}
    </StatusPill>
  )
}

/** Customer, Admin or Superadmin (FE-34). */
export function RolePill({ access, className }: { access: 'user' | 'admin' | 'superadmin'; className?: string }) {
  return (
    <StatusPill tone={access === 'superadmin' ? 'brand' : access === 'admin' ? 'info' : 'neutral'} className={className}>
      {access === 'superadmin' ? 'Superadmin' : access === 'admin' ? 'Admin' : 'Customer'}
    </StatusPill>
  )
}

/** Whether a zone's windows are running (3f, 3g). */
export function ZoneStatusPill({
  status,
  pausedByPlan = false,
  className,
}: {
  status: 'collecting' | 'paused'
  /** Paused by a plan change rather than the user — shown, so it doesn't look like a choice. */
  pausedByPlan?: boolean
  className?: string
}) {
  const byPlan = status === 'paused' && pausedByPlan
  return (
    <StatusPill
      tone={status === 'collecting' ? 'success' : byPlan ? 'warning' : 'neutral'}
      title={byPlan ? 'Paused because it is over your plan’s limits' : undefined}
      className={className}
    >
      {status === 'collecting' ? 'Collecting' : byPlan ? 'Paused · plan limit' : 'Paused'}
    </StatusPill>
  )
}

const CAPTURE_TONE: Record<string, PillTone> = {
  pending: 'neutral',
  processing: 'brand',
  done: 'success',
  failed: 'danger',
  skipped_limit: 'warning',
  missed: 'warning',
}

const CAPTURE_LABEL: Record<string, string> = {
  pending: 'Queued',
  processing: 'Collecting…',
  done: 'Collected',
  failed: 'Failed',
  skipped_limit: 'Skipped — daily limit',
  missed: 'Missed — system was down',
}

/** A capture's status — the same words and colours as the zone page. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <StatusPill tone={CAPTURE_TONE[status] ?? 'neutral'} pulse={status === 'pending' || status === 'processing'} className={className}>
      {CAPTURE_LABEL[status] ?? status}
    </StatusPill>
  )
}
