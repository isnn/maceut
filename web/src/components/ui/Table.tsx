import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp } from './icons'

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
 *
 * On a right-aligned (numeric) column the arrow's slot goes BEFORE the label. After
 * it, the reserved slot pushed the label ~16px left of the numbers below, so the
 * header and its values visibly didn't line up.
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
        {alignEnd && <SortArrow active={active} direction={direction} />}
        {children}
        {!alignEnd && <SortArrow active={active} direction={direction} />}
      </button>
    </th>
  )
}

/** Fixed slot: the arrow appearing must not resize the header. */
function SortArrow({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <span aria-hidden className="w-3 shrink-0 inline-flex justify-center">
      {active && (direction === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />)}
    </span>
  )
}

/**
 * The pages to offer: first, last, and the current page with its neighbours; gaps
 * become an ellipsis. `1 … 4 5 6 … 12` rather than twelve buttons.
 */
function pageList(page: number, pageCount: number): (number | 'gap')[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount))
  const sorted = [...wanted].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1]
    if (prev !== undefined && p - prev > 1) out.push(p - prev === 2 ? p - 1 : 'gap')
    out.push(p)
  })
  return out
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

  const first = matchCount === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, matchCount)

  return (
    <div className="flex flex-wrap items-center justify-between gap-md">
      <p className="flex flex-wrap items-center gap-sm text-caption text-text-muted tabular-nums">
        <span>
          Showing{' '}
          <span className="font-semibold text-text-secondary">
            {first}&ndash;{last}
          </span>{' '}
          of <span className="font-semibold text-text-secondary">{matchCount}</span> {noun}
        </span>
        {filtered && (
          <>
            <span aria-hidden>·</span>
            <span>{totalCount} total</span>
            {onClearSearch && (
              <button onClick={onClearSearch} className="text-info hover:underline">
                Clear search
              </button>
            )}
          </>
        )}
      </p>

      {/* Always shown — one page renders as a disabled ‹ 1 › — so every table on every
          page carries the same control, instead of it appearing only once a list grows. */}
      {pageCount >= 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-xs">
          <PageButton onClick={() => onPage(page - 1)} disabled={page <= 1} label="Previous page">
            <IconArrowLeft size={14} />
          </PageButton>
          {pageList(page, pageCount).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} aria-hidden className="w-8 text-center text-caption text-text-muted">
                …
              </span>
            ) : (
              <PageButton key={p} onClick={() => onPage(p)} active={p === page} label={`Page ${p}`}>
                {p}
              </PageButton>
            ),
          )}
          <PageButton onClick={() => onPage(page + 1)} disabled={page >= pageCount} label="Next page">
            <IconArrowRight size={14} />
          </PageButton>
        </nav>
      )}
    </div>
  )
}

function PageButton({
  onClick,
  disabled,
  active,
  label,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-grid place-items-center h-8 min-w-8 px-sm rounded-md border text-caption font-semibold tabular-nums transition-colors',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        active
          ? 'bg-primary border-primary text-on-primary'
          : 'bg-canvas border-border text-text-secondary hover:border-primary hover:text-text-primary',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-text-secondary',
      )}
    >
      {children}
    </button>
  )
}
