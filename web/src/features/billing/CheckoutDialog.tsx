'use client'

import { Dialog } from '@base-ui/react/dialog'
import { DialogCloseX } from '@/components/ui/DialogCloseX'
import { Button } from '@/components/ui/Button'
import { PlanPill } from '@/components/ui/Badge'
import { IconAlert, IconCheck, IconLock } from '@/components/ui/icons'
import { PLAN_HIGHLIGHTS, PLAN_LABEL } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import type { Plan } from '@/features/auth/types'
import { formatRupiah } from './api'

const DAY_MS = 86_400_000
const METHODS = ['QRIS', 'Bank transfer', 'E-wallet', 'Card']

/**
 * "Confirm your order" (FE-56): the step between picking a plan and Midtrans' Snap
 * page, so the customer sees exactly what they pay for and when it ends before any
 * money moves. The dates follow payment.service activate(): a renewal adds 30 days to
 * the current end; any other plan starts when the payment is confirmed, and time left
 * on the old plan does not carry over.
 */
export function CheckoutDialog({
  open,
  plan,
  currentPlan,
  currentEnd,
  price,
  periodDays,
  openedAt,
  onConfirm,
  onCancel,
}: {
  open: boolean
  plan: Plan | null
  currentPlan: Plan
  /** The current paid period's end, if any. */
  currentEnd: string | null
  price: number
  periodDays: number
  /** When the dialog was opened: the dates are worked out from then. */
  openedAt: number
  onConfirm: (plan: Plan) => void
  onCancel: () => void
}) {
  const now = openedAt
  const endsAt = currentEnd ? new Date(currentEnd).getTime() : null
  const timeLeft = endsAt !== null && endsAt > now
  const renewal = plan !== null && plan === currentPlan && timeLeft
  const start = renewal ? endsAt! : now
  const end = start + periodDays * DAY_MS
  const daysLost = !renewal && timeLeft && currentPlan !== 'free' ? Math.ceil((endsAt! - now) / DAY_MS) : 0

  return (
    <Dialog.Root open={open && plan !== null} onOpenChange={(next) => !next && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[30rem] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <DialogCloseX />
          {plan && (
            <div className="space-y-lg">
              <div className="pr-xl">
                <p className="text-micro font-semibold uppercase tracking-wide text-text-muted">
                  {renewal ? 'Renew your plan' : 'Confirm your order'}
                </p>
                <Dialog.Title className="mt-xs flex items-center gap-sm text-section-title text-text-primary">
                  {PLAN_LABEL[plan]} plan
                  <PlanPill plan={plan} />
                </Dialog.Title>
              </div>

              <ul className="grid grid-cols-1 tablet:grid-cols-2 gap-x-lg gap-y-xs">
                {PLAN_HIGHLIGHTS[plan].slice(0, 4).map((item) => (
                  <li key={item} className="flex items-start gap-sm text-caption text-text-secondary">
                    <IconCheck size={14} className="text-success-icon mt-[2px]" />
                    {item}
                  </li>
                ))}
              </ul>

              <dl className="rounded-md bg-canvas-secondary p-lg space-y-sm text-body">
                <div className="flex justify-between gap-md">
                  <dt className="text-text-secondary">Period</dt>
                  <dd className="text-text-primary text-right">{periodDays} days</dd>
                </div>
                <div className="flex justify-between gap-md">
                  <dt className="text-text-secondary">{renewal ? 'Adds' : 'Active'}</dt>
                  <dd className="text-text-primary text-right tabular-nums">
                    {renewal ? formatDate(new Date(start)) : 'From payment'} – {formatDate(new Date(end))}
                  </dd>
                </div>
                <div className="flex justify-between gap-md border-t border-border pt-sm mt-sm">
                  <dt className="text-text-primary font-semibold">Total today</dt>
                  <dd className="text-page-title font-bold text-text-primary tabular-nums">{formatRupiah(price)}</dd>
                </div>
              </dl>

              {daysLost > 0 && (
                <p className="flex items-start gap-sm text-caption text-warning-text">
                  <IconAlert size={14} className="text-warning-icon mt-[1px]" />
                  <span>
                    Your {PLAN_LABEL[currentPlan]} plan has {daysLost} {daysLost === 1 ? 'day' : 'days'} left. They don’t carry
                    over: {PLAN_LABEL[plan]} starts as soon as this payment is confirmed.
                  </span>
                </p>
              )}

              <div className="space-y-sm">
                <p className="flex items-center gap-sm text-caption text-text-secondary">
                  <IconLock size={14} className="text-text-muted" />
                  You pay on Midtrans’ secure page. Your plan changes only once Midtrans confirms the payment.
                </p>
                <ul className="flex flex-wrap gap-xs" aria-label="Payment methods">
                  {METHODS.map((m) => (
                    <li key={m} className="px-sm py-[2px] rounded-xs border border-border text-micro text-text-secondary">
                      {m}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col-reverse tablet:flex-row tablet:justify-end gap-sm">
                <Button variant="secondary" onClick={onCancel}>
                  Cancel
                </Button>
                <Button onClick={() => onConfirm(plan)}>Pay {formatRupiah(price)}</Button>
              </div>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
