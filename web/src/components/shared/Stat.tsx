import type { ReactNode } from 'react'
import { IconChip } from './SectionHeader'

/**
 * One figure: a brand-tinted icon, a small muted label, a bold value. Zone details and
 * the figures under the captures map both use it, so a label looks the same wherever
 * it appears on the page.
 */
export function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start gap-md min-w-0">
      <IconChip>{icon}</IconChip>
      <div className="min-w-0">
        <dt className="text-caption text-text-muted">{label}</dt>
        <dd className="text-heading-sm text-text-primary tabular-nums mt-[2px] break-words">{value}</dd>
        {hint && <p className="text-micro text-text-muted mt-[2px]">{hint}</p>}
      </div>
    </div>
  )
}
