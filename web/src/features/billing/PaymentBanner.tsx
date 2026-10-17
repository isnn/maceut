'use client'

import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PLAN_LABEL } from '@/lib/constants'
import type { Plan } from '@/features/auth/types'
import { formatRupiah, type Payment } from './api'
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
  onDismiss,
}: {
  state: PayState
  open: Payment | null
  onResume: (p: Payment) => void
  onRetry: (plan: Plan) => void
  onDismiss: () => void
}) {
  if (state.kind === 'starting') return <Alert variant="info">Opening the payment page…</Alert>
  if (state.kind === 'confirming') return <Alert variant="info">Confirming your payment with Midtrans…</Alert>
  if (state.kind === 'paid') return <Alert variant="success">Payment received. Updating your plan…</Alert>

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
        Waiting for your payment for {PLAN_LABEL[waiting.plan]} ({formatRupiah(waiting.amount)}). Your plan switches as
        soon as it’s paid, and we’ll let you know.
      </span>
      {waiting.snapToken && (
        <Button size="sm" className="shrink-0" onClick={() => onResume(waiting)}>
          Continue payment
        </Button>
      )}
    </Alert>
  )
}
