'use client'

import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PLAN_LABEL } from '@/lib/constants'
import type { Plan } from '@/features/auth/types'
import { formatDate } from '@/lib/utils'
import { formatRupiah, paymentTypeLabel, type Payment } from './api'
import type { PayState } from './usePayPlan'

/**
 * Where a payment stands, above the plan cards (FE-56). `open` is the server's open
 * payment from an earlier visit, so "Continue payment" survives a refresh.
 */
export function PaymentBanner({
  state,
  open,
  onResume,
  onRetry,
  onChangeMethod,
  onDismiss,
}: {
  state: PayState
  open: Payment | null
  onResume: (p: Payment) => void
  onRetry: (plan: Plan) => void
  /** Cancel the method picked in Snap and choose another (a new Snap page). */
  onChangeMethod: (p: Payment) => void
  onDismiss: () => void
}) {
  if (state.kind === 'starting') return <Alert variant="info">Opening the payment page…</Alert>
  if (state.kind === 'confirming') return <Alert variant="info">Confirming your payment with Midtrans…</Alert>
  if (state.kind === 'paid') {
    return (
      <Alert variant="success" className="items-center flex-wrap">
        <span className="flex-1 min-w-0">
          Payment received. {PLAN_LABEL[state.payment.plan]} is active
          {state.payment.periodEnd ? ` until ${formatDate(state.payment.periodEnd)}` : ''}.
        </span>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={onDismiss}>
          Dismiss
        </Button>
      </Alert>
    )
  }

  if (state.kind === 'failed') {
    return (
      <Alert variant="warning" className="items-center flex-wrap">
        <span className="flex-1 min-w-0">{state.message}</span>
        <span className="flex gap-sm shrink-0">
          {state.plan && state.plan !== 'free' && (
            <Button size="sm" onClick={() => onRetry(state.plan!)}>
              Try again
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
        </span>
      </Alert>
    )
  }

  const waiting = state.kind === 'waiting' ? state.payment : open
  if (!waiting) return null
  return (
    <Alert variant="info" className="items-center flex-wrap">
      <span className="flex-1 min-w-0">
        Waiting for your payment for {PLAN_LABEL[waiting.plan]} ({formatRupiah(waiting.amount)})
        {waiting.paymentType ? ` by ${paymentTypeLabel(waiting.paymentType)}` : ''}. Your plan switches as soon as it’s paid,
        and we’ll let you know.
      </span>
      <span className="flex gap-sm shrink-0">
        {waiting.snapToken && (
          <Button size="sm" onClick={() => onResume(waiting)}>
            Continue payment
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => onChangeMethod(waiting)}>
          Change method
        </Button>
      </span>
    </Alert>
  )
}
