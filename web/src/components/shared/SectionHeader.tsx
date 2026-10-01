import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The one header every page section uses — title, an optional one-line description,
 * and actions on the right. The zone page had grown four variations of this (different
 * sizes, a caption on some and not others, a text link where its neighbours had
 * buttons); one component keeps them identical.
 */
export function SectionHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Optional brand-tinted chip before the title. */
  icon?: ReactNode
}) {
  return (
    <div className={cn('flex flex-wrap justify-between gap-md', description ? 'items-end' : 'items-center')}>
      {/* With a description the chip sits beside both lines; without one it centres on
          the title, so the icon and the words share a middle line. */}
      <div className={cn('min-w-0 flex gap-md', description ? 'items-start' : 'items-center')}>
        {icon && <IconChip>{icon}</IconChip>}
        <div className="min-w-0">
          <h2 className="text-section-title text-text-primary leading-tight">{title}</h2>
          {description && <p className="text-caption text-text-muted mt-xs">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-sm ml-auto">{actions}</div>}
    </div>
  )
}

/** The title inside a card — one step below a section title, the same on every card. */
export function CardTitle({ children, aside, icon }: { children: ReactNode; aside?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-xs">
      {icon && <IconChip size="sm">{icon}</IconChip>}
      <h3 className={cn('text-heading-sm text-text-primary', Boolean(icon) && 'ml-xs')}>{children}</h3>
      {aside}
    </div>
  )
}

/** The brand-tinted square an icon sits in — section titles and stats share it. */
export function IconChip({ children, size = 'md' }: { children: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 rounded-md bg-primary-soft text-primary flex items-center justify-center',
        size === 'md' ? 'w-9 h-9' : 'w-7 h-7',
      )}
    >
      {children}
    </span>
  )
}
