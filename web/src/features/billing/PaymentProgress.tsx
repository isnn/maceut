'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconAlert, IconCheck, IconClock, IconDownload, IconLock, IconX } from '@/components/ui/icons'
import { PLAN_LABEL } from '@/lib/constants'
import { cn, formatDate, formatWibShort } from '@/lib/utils'
import type { Plan } from '@/features/auth/types'
import { formatRupiah, paymentTypeLabel, type Payment } from './api'
import type { PayState } from './usePayPlan'

/** Mirrors api payment.service PAYMENT_WINDOW_HOURS: how long a Snap order stays payable. */
const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000

type Step = 'done' | 'active' | 'waiting' | 'failed' | 'todo'
type Tone = 'brand' | 'warning' | 'success' | 'danger'

const EMBLEM: Record<Tone, string> = {
  brand: 'bg-primary-soft text-primary',
  warning: 'bg-warning-bg text-warning-icon',
  success: 'bg-success-bg text-success-icon',
  danger: 'bg-danger-bg text-danger-icon',
}

/** A ring that turns while something is in flight; still under reduced motion. */
function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin motion-reduce:animate-none', className)}
    />
  )
}

/** Minute-accurate clock for the "pay by" countdown. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function timeLeft(ms: number): string {
  if (ms <= 0) return 'time is up'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`
}

/** Order → Payment → Plan active, the three things a customer waits through. */
function Tracker({ steps }: { steps: [Step, Step, Step] }) {
  const labels = ['Order', 'Payment', 'Plan active']
  return (
    <ol className="flex items-center gap-sm" aria-label="Payment progress">
      {steps.map((step, i) => (
        <li key={labels[i]} className="flex items-center gap-sm min-w-0">
          <span
            className={cn(
              'w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 text-micro font-semibold',
              step === 'done' && 'bg-success-icon text-on-primary',
              step === 'active' && 'bg-primary text-on-primary',
              step === 'waiting' && 'bg-warning-icon text-on-primary',
              step === 'failed' && 'bg-danger-icon text-on-primary',
              step === 'todo' && 'border border-border text-text-muted',
            )}
            aria-hidden="true"
          >
            {step === 'done' ? <IconCheck size={12} /> : step === 'failed' ? <IconX size={12} /> : i + 1}
          </span>
          <span
            className={cn(
              'text-caption whitespace-nowrap',
              step === 'todo' ? 'text-text-muted' : 'text-text-primary font-medium',
            )}
          >
            {labels[i]}
            <span className="sr-only">
              {step === 'done' ? ' (done)' : step === 'failed' ? ' (not completed)' : step === 'todo' ? '' : ' (in progress)'}
            </span>
          </span>
          {i < 2 && <span aria-hidden="true" className={cn('h-px w-6 tablet:w-10 shrink-0', step === 'done' ? 'bg-success-icon' : 'bg-border')} />}
        </li>
      ))}
    </ol>
  )
}

/**
 * Where a payment stands, above the plan tabs (FE-56). Replaces the plain banner: one
 * card that says what is happening, what was ordered, what the customer can do, and how
 * far along it is. `open` is the server's open payment from an earlier visit, so a
 * payment waiting on a bank transfer survives a refresh.
 */
export function PaymentProgress({
  state,
  open,
  onResume,
  onCheck,
  onRetry,
  onChangeMethod,
  onInvoice,
  onDismiss,
}: {
  state: PayState
  open: Payment | null
  onResume: (p: Payment) => void
  /** "I've paid": one status check with Midtrans. */
  onCheck: (p: Payment) => void
  onRetry: (plan: Plan) => void
  onChangeMethod: (p: Payment) => void
  onInvoice: (orderId: string) => void
  onDismiss: () => void
}) {
  const waiting = state.kind === 'waiting' ? state.payment : state.kind === 'idle' ? open : null
  const now = useNow(waiting !== null)

  let tone: Tone
  let emblem: React.ReactNode
  let eyebrow: string
  let title: string
  let body: React.ReactNode
  let steps: [Step, Step, Step]
  let actions: React.ReactNode = null
  const live = state.kind === 'starting' || state.kind === 'confirming'

  if (state.kind === 'starting') {
    tone = 'brand'
    emblem = <Spinner />
    eyebrow = 'Starting payment'
    title = `Opening the secure payment page for ${PLAN_LABEL[state.plan]}…`
    body = (
      <span className="inline-flex items-center gap-xs">
        <IconLock size={14} className="text-text-muted" />
        The payment window opens on this page.
      </span>
    )
    steps = ['active', 'todo', 'todo']
  } else if (state.kind === 'confirming') {
    tone = 'brand'
    emblem = <Spinner />
    eyebrow = 'Confirming'
    title = 'Checking your payment…'
    body = 'This takes a few seconds. Your plan switches as soon as the payment is confirmed.'
    steps = ['done', 'active', 'todo']
  } else if (state.kind === 'paid') {
    const p = state.payment
    tone = 'success'
    emblem = <IconCheck size={22} />
    eyebrow = 'Payment received'
    title = `You’re on ${PLAN_LABEL[p.plan]}${p.periodEnd ? ` until ${formatDate(p.periodEnd)}` : ''}`
    body = `${formatRupiah(p.amount)}${p.paymentType ? ` · ${paymentTypeLabel(p.paymentType)}` : ''} · Your new limits apply now.`
    steps = ['done', 'done', 'done']
    actions = (
      <>
        <Button size="sm" variant="secondary" onClick={() => onInvoice(p.orderId)}>
          <IconDownload size={14} />
          Invoice
        </Button>
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Done
        </Button>
      </>
    )
  } else if (state.kind === 'failed') {
    tone = 'danger'
    emblem = <IconAlert size={22} />
    eyebrow = 'Not completed'
    title = 'The payment didn’t go through'
    body = state.message
    steps = ['done', 'failed', 'todo']
    actions = (
      <>
        {state.plan && state.plan !== 'free' && (
          <Button size="sm" onClick={() => onRetry(state.plan!)}>
            Try again
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </>
    )
  } else if (waiting) {
    const deadline = new Date(waiting.createdAt).getTime() + PAYMENT_WINDOW_MS
    tone = 'warning'
    emblem = <IconClock size={22} />
    eyebrow = 'Waiting for payment'
    title = `${PLAN_LABEL[waiting.plan]} · ${formatRupiah(waiting.amount)}`
    body = (
      <>
        {waiting.paymentType ? `${paymentTypeLabel(waiting.paymentType)}. ` : 'No method chosen yet. '}
        Pay by <span className="font-semibold text-text-primary">{formatWibShort(new Date(deadline))} WIB</span>{' '}
        <span className="tabular-nums">({timeLeft(deadline - now)})</span>. We’ll switch your plan and let you know once it’s
        paid.
      </>
    )
    steps = ['done', 'waiting', 'todo']
    actions = (
      <>
        {waiting.snapToken && (
          <Button size="sm" onClick={() => onResume(waiting)}>
            Continue payment
          </Button>
        )}
        <Button size="sm" variant="tint" onClick={() => onCheck(waiting)}>
          I’ve paid
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onChangeMethod(waiting)}>
          Change method
        </Button>
      </>
    )
  } else {
    return null
  }

  return (
    <Card className="p-lg" role="status" aria-live="polite" aria-busy={live}>
      <div className="flex flex-col laptop:flex-row laptop:items-center gap-lg">
        <div className="flex items-start gap-lg min-w-0 flex-1">
          <span className={cn('w-11 h-11 rounded-full inline-flex items-center justify-center shrink-0', EMBLEM[tone])}>
            {emblem}
          </span>
          <div className="min-w-0 space-y-xs">
            <p className="text-micro font-semibold uppercase tracking-wide text-text-muted">{eyebrow}</p>
            <p className="text-heading-sm text-text-primary text-balance">{title}</p>
            <p className="text-body text-text-secondary">{body}</p>
            <div className="pt-sm overflow-x-auto">
              <Tracker steps={steps} />
            </div>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-sm laptop:justify-end shrink-0">{actions}</div>}
      </div>
    </Card>
  )
}
