import { ROAD_CLASS_LABEL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { RoadClass } from '@/features/zones/types'

const ROAD_CLASS_STYLE: Record<RoadClass, string> = {
  nasional: 'bg-canvas-secondary text-text-muted border border-border',
  nasional_provinsi: 'bg-primary-soft text-[#5A35F3]',
  semua: 'bg-success-bg text-success-text',
}

export function RoadClassBadge({ roadClass, className }: { roadClass: RoadClass; className?: string }) {
  return (
    <span className={cn('text-micro rounded-xs px-sm py-xs', ROAD_CLASS_STYLE[roadClass], className)}>
      {ROAD_CLASS_LABEL[roadClass]}
    </span>
  )
}

export type PillTone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral'

const PILL_TONE: Record<PillTone, string> = {
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-danger-bg text-danger-text',
  brand: 'bg-primary-soft text-primary',
  neutral: 'bg-canvas-secondary text-text-secondary',
}

const PILL_DOT: Record<PillTone, string> = {
  success: 'bg-success-icon',
  warning: 'bg-warning-icon',
  danger: 'bg-danger-icon',
  brand: 'bg-primary',
  neutral: 'bg-text-muted',
}

/**
 * The one status shape: a tinted pill with a coloured dot. Zone, capture window,
 * capture and export statuses all use it, so "running", "failed" and "paused" look the
 * same wherever they appear. `pulse` marks something still in progress.
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
        'inline-flex items-center gap-xs text-micro font-semibold rounded-full px-sm py-xs whitespace-nowrap tabular-nums',
        PILL_TONE[tone],
        className,
      )}
    >
      <span aria-hidden className={cn('w-1.5 h-1.5 rounded-full shrink-0', PILL_DOT[tone], pulse && 'animate-pulse')} />
      {children}
    </span>
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

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style: Record<string, string> = {
    pending: 'bg-canvas-secondary text-text-muted border border-border',
    processing: 'bg-primary-soft text-[#5A35F3]',
    done: 'bg-success-bg text-success-text',
    failed: 'bg-danger-bg text-danger-text',
    skipped_limit: 'bg-warning-bg text-warning-text',
  }
  return (
    <span className={cn('text-micro rounded-xs px-sm py-xs capitalize', style[status] ?? style.pending, className)}>
      {status.replace('_', ' ')}
    </span>
  )
}
