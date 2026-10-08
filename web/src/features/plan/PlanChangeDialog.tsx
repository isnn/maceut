'use client'

import { Dialog } from '@base-ui/react/dialog'
import { DialogCloseX } from '@/components/ui/DialogCloseX'
import { buttonClass } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { REASON_LABEL, type ImpactItem, type PlanImpact } from './impact'

/**
 * The confirmation before a plan moves down (ADR-020): exactly which zones and capture
 * windows will pause, and why — from the server's own preview. It used to be a guess
 * computed in the browser from counts, which couldn't see intervals or daily frame
 * budgets, or (for customers) no preview at all.
 */
export function PlanChangeDialog({
  open,
  title,
  planLabel,
  impact,
  loading,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  planLabel: string
  /** Null while it loads. */
  impact: PlanImpact | null
  loading: boolean
  pending: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[30rem] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3 space-y-lg">
          <DialogCloseX />
          <Dialog.Title className="pr-xl text-section-title text-text-primary">{title}</Dialog.Title>

          {loading || !impact ? (
            <div className="h-24 bg-canvas-secondary rounded-md animate-pulse" />
          ) : impact.clean ? (
            <Dialog.Description className="text-body text-text-secondary">Nothing will be paused.</Dialog.Description>
          ) : (
            <>
              <ImpactList title="Will be paused — zones" items={impact.zonesToPause} />
              <ImpactList title="Will be paused — capture windows" items={impact.schedulesToPause} />
              <Dialog.Description className="text-caption text-text-muted">Nothing is deleted.</Dialog.Description>
            </>
          )}

          {error && <p className="text-caption text-danger-text">{error}</p>}

          <div className="flex justify-end gap-sm">
            <button type="button" onClick={onCancel} disabled={pending} className={buttonClass('secondary')}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || loading || !impact}
              className={buttonClass(impact && !impact.clean ? 'destructive' : 'primary')}
            >
              {pending ? 'Changing…' : impact && !impact.clean ? `Pause these and move to ${planLabel}` : `Move to ${planLabel}`}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ImpactList({ title, items }: { title: string; items: ImpactItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-xs">
      <p className="text-micro font-semibold uppercase tracking-wider text-text-muted">
        {title} · {items.length}
      </p>
      <ul className="rounded-md border border-border divide-y divide-divider">
        {items.map((it) => (
          <li key={it.id} className={cn('flex flex-wrap items-baseline justify-between gap-x-md px-md py-sm')}>
            <span className="text-body font-semibold text-text-primary">{it.name}</span>
            <span className="text-caption text-text-muted">{REASON_LABEL[it.reason]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
