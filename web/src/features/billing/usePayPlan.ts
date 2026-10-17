'use client'

import { useCallback, useState } from 'react'
import { ApiError } from '@/types/api'
import type { Plan } from '@/features/auth/types'
import * as billingApi from './api'
import type { Payment } from './api'
import { openSnap, type SnapResult } from './snap'

/**
 * Paying for a plan from the browser (FE-56), the Midtrans Snap way: the server makes
 * a token, Snap's popup takes the payment, and Snap's callbacks steer this screen.
 *
 * The callbacks are never trusted on their own. Success makes ONE status request, which
 * the server confirms with Midtrans' Get Status API before anything changes; the HTTP
 * notification on the server does the same independently. No polling: a method paid
 * later (bank transfer, convenience store) is confirmed by that notification, and the
 * bell tells the customer.
 */
export type PayState =
  | { kind: 'idle' }
  | { kind: 'starting'; plan: Plan }
  | { kind: 'confirming'; orderId: string }
  | { kind: 'waiting'; payment: Payment }
  | { kind: 'paid'; payment: Payment }
  | { kind: 'failed'; message: string; plan: Plan | null }

const NOT_COMPLETED = 'Payment not completed. Nothing was charged and your plan is unchanged.'

export function usePayPlan() {
  const [state, setState] = useState<PayState>({ kind: 'idle' })

  /** Asks the server what happened; it checks with Midtrans. */
  const confirm = useCallback(async (orderId: string, plan: Plan | null = null) => {
    setState({ kind: 'confirming', orderId })
    try {
      const payment = await billingApi.getPayment(orderId)
      if (payment.status === 'paid') {
        setState({ kind: 'paid', payment })
        // Header, limits and quota readouts all pick up the new plan.
        window.location.reload()
      } else if (payment.status === 'pending' || payment.status === 'creating') {
        setState({ kind: 'waiting', payment })
      } else {
        setState({ kind: 'failed', message: NOT_COMPLETED, plan: payment.plan })
      }
    } catch (err) {
      setState({
        kind: 'failed',
        message: err instanceof ApiError ? err.message : 'Couldn’t check the payment. Refresh the page in a moment.',
        plan,
      })
    }
  }, [])

  const open = useCallback(
    (orderId: string, plan: Plan, token: string, redirectUrl: string) => {
      openSnap(token, redirectUrl, {
        onSuccess: () => void confirm(orderId, plan),
        // Bank transfer and the like: paid later, outside this page.
        onPending: (r: SnapResult) => void confirm(r.order_id ?? orderId, plan),
        onError: () => setState({ kind: 'failed', message: NOT_COMPLETED, plan }),
        // Closing can follow a payment, so ask rather than assume.
        onClose: () => void confirm(orderId, plan),
      })
    },
    [confirm],
  )

  const pay = useCallback(
    async (plan: Plan, opts: { autoRenew?: boolean } = {}) => {
      setState({ kind: 'starting', plan })
      try {
        const c = opts.autoRenew ? await billingApi.enableAutoRenew(plan) : await billingApi.checkout(plan)
        open(c.orderId, c.plan, c.token, c.redirectUrl)
      } catch (err) {
        setState({
          kind: 'failed',
          message: err instanceof ApiError ? err.message : 'Couldn’t start the payment. Please try again.',
          plan,
        })
      }
    },
    [open],
  )

  /** "Continue payment": the same Snap page, while it is still payable. */
  const resume = useCallback(
    (payment: Payment) => {
      if (payment.snapToken && payment.redirectUrl) open(payment.orderId, payment.plan, payment.snapToken, payment.redirectUrl)
      else void confirm(payment.orderId, payment.plan)
    },
    [open, confirm],
  )

  const reset = useCallback(() => setState({ kind: 'idle' }), [])

  return { state, pay, resume, confirm, reset }
}
