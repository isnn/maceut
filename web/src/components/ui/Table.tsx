import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { IconArrowDown, IconArrowUp } from './icons'

/** Shared data-table shell for the zone and member tables (3f, 3n). */
export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-card border border-border rounded-lg overflow-hidden', className)}>
      <div className="overflow-x-auto">{props.children}</div>
    </div>
  )
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse', className)} {...props} />
}

// Split so SortableTh can put the padding on its button instead of the cell.
// Passing `p-0` to override it doesn't work: Tailwind emits `px-*`/`py-*` after
// `p-*`, so the shorthand loses and both paddings apply — a double-height header.
const TH_BASE =
  'text-left text-micro font-semibold uppercase tracking-wide text-text-muted bg-canvas-secondary border-b border-border whitespace-nowrap'
const TH_PADDING = 'px-lg py-md'

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn(TH_BASE, TH_PADDING, className)} {...props} />
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-lg py-md border-b border-divider text-body text-text-primary align-middle', className)} {...props} />
}

export type SortDirection = 'asc' | 'desc'

interface SortableThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** True when the table is currently sorted by this column. */
  active: boolean
  direction: SortDirection
  onSort: () => void
}

/**
 * Column header that sorts on click. The direction arrow only renders on the
 * active column — showing one on every header implies they're all sorted.
 */
export function SortableTh({ active, direction, onSort, className, children, ...props }: SortableThProps) {
  const alignEnd = className?.includes('text-right')
  return (
    <th
      className={cn(TH_BASE, className)}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'w-full inline-flex items-center gap-xs uppercase tracking-wide',
          TH_PADDING,
          'hover:text-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary transition-colors',
          active ? 'text-text-primary' : 'text-text-muted',
          alignEnd && 'justify-end'
        )}
      >
        {children}
        {/* Fixed slot: the arrow appearing must not resize the header. */}
        <span aria-hidden className="w-3 shrink-0 inline-flex justify-center">
          {active && (direction === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />)}
        </span>
      </button>
    </th>
  )
}
