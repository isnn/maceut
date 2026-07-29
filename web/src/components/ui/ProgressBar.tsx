import { cn } from '@/lib/utils'

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const level = pct >= 100 ? 'critical' : pct >= 80 ? 'warning' : 'normal'
  const track = { normal: 'bg-canvas-secondary', warning: 'bg-warning-bg', critical: 'bg-red-100' }
  const fill = { normal: 'bg-primary', warning: 'bg-warning-icon', critical: 'bg-red-500' }
  return (
    <div className={cn('h-1.5 rounded-full overflow-hidden', track[level], className)}>
      <div className={cn('h-full rounded-full transition-all', fill[level])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-body">
      <span className="text-text-secondary">{label}</span>
      <span className="font-semibold text-text-primary">{value}</span>
    </div>
  )
}
