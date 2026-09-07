import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

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

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'text-left text-micro font-semibold uppercase tracking-wide text-text-muted bg-canvas-secondary px-lg py-md border-b border-border whitespace-nowrap',
        className
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-lg py-md border-b border-divider text-body text-text-primary align-middle', className)} {...props} />
}
