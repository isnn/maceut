import type { ReactNode } from 'react'

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
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-md">
      <div className="min-w-0">
        <h2 className="text-section-title text-text-primary">{title}</h2>
        {description && <p className="text-caption text-text-muted mt-xs">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-sm ml-auto">{actions}</div>}
    </div>
  )
}

/** The title inside a card — one step below a section title, the same on every card. */
export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-xs">
      <h3 className="text-heading-sm text-text-primary">{children}</h3>
      {aside}
    </div>
  )
}
