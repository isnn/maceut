import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, ReactNode } from 'react'
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

/**
 * Page controls under a table.
 *
 * Renders even on a single page, showing only the count. A control that appears and
 * disappears as rows are filtered makes the page jump under the pointer, and the
 * "showing X of Y" line is worth having either way — it is what tells someone a search
 * is active when the box has scrolled out of view.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  onPage,
  matchCount,
  totalCount,
  noun = 'rows',
  onClearSearch,
}: {
  page: number
  pageCount: number
  /** Must match the hook's page size, or the "showing X–Y" range lies. */
  pageSize: number
  onPage: (next: number) => void
  matchCount: number
  totalCount: number
  /** Plural noun for the count line, e.g. "zones", "accounts". */
  noun?: string
  /** Offered when a search is hiding rows, so the way back is one click. */
  onClearSearch?: () => void
}) {
  const filtered = matchCount !== totalCount

  return (
    <div className="flex flex-wrap items-center justify-between gap-md text-caption text-text-muted">
      <span className="flex items-center gap-sm">
        Showing {matchCount === 0 ? 0 : (page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, matchCount)} of{' '}
        {matchCount} {noun}
        {filtered && (
          <>
            <span aria-hidden>·</span>
            <span>{totalCount} total</span>
            {onClearSearch && (
              <button onClick={onClearSearch} className="text-info hover:underline">
                Clear
              </button>
            )}
          </>
        )}
      </span>

      {pageCount > 1 && (
        <span className="flex items-center gap-sm">
          <PageButton onClick={() => onPage(page - 1)} disabled={page <= 1} label="Previous page">
            Previous
          </PageButton>
          <span className="tabular-nums px-sm">
            Page {page} of {pageCount}
          </span>
          <PageButton onClick={() => onPage(page + 1)} disabled={page >= pageCount} label="Next page">
            Next
          </PageButton>
        </span>
      )}
    </div>
  )
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'px-md py-xs rounded-sm border border-border transition-colors',
        'hover:bg-canvas-secondary hover:text-text-primary',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  )
}
