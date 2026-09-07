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

/** Whether a zone's windows are running (3f, 3g). */
export function ZoneStatusPill({ status, className }: { status: 'collecting' | 'paused'; className?: string }) {
  return (
    <span
      className={cn(
        'text-micro font-semibold rounded-xs px-sm py-xs whitespace-nowrap',
        status === 'collecting' ? 'bg-success-bg text-success-text' : 'bg-canvas-secondary text-text-muted border border-border',
        className
      )}
    >
      {status === 'collecting' ? 'Collecting' : 'Paused'}
    </span>
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
