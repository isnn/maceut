'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, buttonClass } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@base-ui/react/dialog'
import { DialogCloseX } from '@/components/ui/DialogCloseX'
import { PlanPill, StatusPill, type PillTone } from '@/components/ui/Badge'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { UsageMeter, AttributeRow } from '@/components/ui/UsageMeter'
import { poolOutlook, poolResetDay } from '@/features/plan/pool'
import { Alert } from '@/components/ui/Alert'
import { PlanCards } from '@/features/marketing/components/PlanCards'
import { forgetIntendedPlan, planFromUrl } from '@/features/marketing/intended-plan'
import { cn, formatDate, formatNumber } from '@/lib/utils'
import { IconCheck } from '@/components/ui/icons'
import { PLAN_LABEL, PLAN_LIMITS, PLAN_ORDER, PLAN_PRICE, ROAD_CLASS_LABEL } from '@/lib/constants'
import { refreshCurrentUser, useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as authApi from '@/features/auth/api'
import * as dashboardApi from '@/features/dashboard/api'
import type { UsageSummary } from '@/features/dashboard/api'
import type { Plan } from '@/features/auth/types'
import { ApiError } from '@/types/api'
import { PlanChangeDialog } from '@/features/plan/PlanChangeDialog'
import { previewOwnPlanChange, type PlanImpact } from '@/features/plan/impact'
import { NotificationSettings } from '@/features/notifications/NotificationSettings'
import * as billingApi from '@/features/billing/api'
import { formatRupiah, paymentTypeLabel, type Payment, type PaymentStatus, type Prices } from '@/features/billing/api'
import { usePayPlan } from '@/features/billing/usePayPlan'
import { PaymentProgress } from '@/features/billing/PaymentProgress'
import { CheckoutDialog } from '@/features/billing/CheckoutDialog'
import { AutoRenewCard } from '@/features/billing/AutoRenewCard'

const DAY_MS = 86_400_000
const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: PillTone }> = {
  creating: { label: 'Starting', tone: 'neutral' },
  pending: { label: 'Waiting', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'info' },
}

const ALL_TABS = ['Usage', 'Account', 'Payment & billing', 'Notifications'] as const
type Tab = (typeof ALL_TABS)[number]

/**
 * Staff see only Account and Notifications. Usage and Billing are customer
 * concerns — an internal account has no plan quota to report, and its
 * seeded figures would be noise to someone with no Zones page to open.
 */
const TABS_FOR: Record<'tenant' | 'internal', readonly Tab[]> = {
  tenant: ALL_TABS,
  internal: ['Account', 'Notifications'],
}

/** What only Premium has (PKG-F8). History is 30 days on every paid plan, so it is not listed. */
const PREMIUM = PLAN_LIMITS.premium
const PREMIUM_UNLOCKS = [
  'Captures every 15 minutes',
  'All roads, down to local streets',
  `${PREMIUM.zonesLimit} zones and ${formatNumber(PREMIUM.monthlyCaptures)} captures a month`,
  `${formatNumber(PREMIUM.exportFramesLimit)} frames per export`,
]

function limitsPeriod(prices: Prices | null): string {
  return `${prices?.periodDays ?? 30} days`
}

export function ProfileView({ variant = 'tenant' }: { variant?: 'tenant' | 'internal' }) {
  const { user } = useCurrentUser()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const tabs = TABS_FOR[variant]
  const [tab, setTab] = useState<Tab>(variant === 'internal' ? 'Account' : 'Usage')
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  /** `?plan=` from the pricing page after sign-up (FE-37): open the picker on that plan. */
  const [intendedPlan] = useState(() => (variant === 'internal' ? null : planFromUrl()))
  const [pickerOpen, setPickerOpen] = useState(intendedPlan !== null)
  // Shown once: the intent has done its job when the picker opens on it.
  useEffect(() => {
    if (intendedPlan) forgetIntendedPlan()
  }, [intendedPlan])

  useEffect(() => {
    if (variant === 'internal') return
    dashboardApi.getUsage().then(setUsage)
  }, [variant])

  // FE-56: paying for a plan with Midtrans Snap.
  const [prices, setPrices] = useState<Prices | null>(null)
  const [openPayment, setOpenPayment] = useState<Payment | null>(null)
  const [payments, setPayments] = useState<Payment[] | null>(null)
  useEffect(() => {
    if (variant === 'internal') return
    billingApi.getPrices().then(setPrices).catch(() => setPrices(null))
    billingApi.getPending().then(setOpenPayment).catch(() => setOpenPayment(null))
    billingApi.getHistory().then(setPayments).catch(() => setPayments([]))
  }, [variant])

  /**
   * After a payment or plan change: re-read the account, usage and payments in place,
   * so the header, limits and Billing tab update without a full reload.
   */
  const refresh = useCallback(() => {
    refreshCurrentUser()
    dashboardApi.getUsage().then(setUsage).catch(() => undefined)
    billingApi.getPending().then(setOpenPayment).catch(() => undefined)
    billingApi.getHistory().then(setPayments).catch(() => undefined)
  }, [])
  const payment = usePayPlan(refresh)
  /** The plan in the "Confirm your order" step, before Snap opens. */
  const [checkout, setCheckout] = useState<{ plan: Plan; at: number } | null>(null)
  const startCheckout = (plan: Plan) => setCheckout({ plan, at: Date.now() })
  /** When the page opened: enough to tell whether Renew is past the 6-month cap. */
  const [openedAt] = useState(() => Date.now())
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)

  async function saveInvoice(orderId: string) {
    setInvoiceBusy(orderId)
    setInvoiceError(null)
    try {
      await billingApi.downloadInvoice(orderId)
    } catch (err) {
      setInvoiceError(err instanceof ApiError ? err.message : 'Couldn’t download the invoice. Please try again.')
    } finally {
      setInvoiceBusy(null)
    }
  }

  // Back from Midtrans' hosted page (finish redirect): one status check, then a clean URL.
  const { confirm } = payment
  useEffect(() => {
    if (variant === 'internal') return
    const orderId = new URLSearchParams(window.location.search).get('payment')
    if (!orderId) return
    window.history.replaceState(null, '', window.location.pathname)
    void Promise.resolve().then(() => confirm(orderId))
  }, [variant, confirm])

  /**
   * Downgrades only. The server refuses an upgrade with UPGRADE_NOT_SELF_SERVE until
   * billing exists, so the refusal is surfaced rather than left as a button stuck on
   * "Saving…" — which is what happened before, because nothing caught the throw.
   *
   * A downgrade first shows exactly what it will pause (ADR-020), from the server's own
   * preview. It used to apply straight away behind a generic warning.
   */
  const [confirming, setConfirming] = useState<{ plan: Plan; impact: PlanImpact | null } | null>(null)

  function changePlan(plan: Plan) {
    setPlanError(null)
    setConfirming({ plan, impact: null })
    previewOwnPlanChange(plan)
      .then((impact) => setConfirming((c) => (c && c.plan === plan ? { plan, impact } : c)))
      .catch((err) => {
        setConfirming(null)
        setPlanError(err instanceof ApiError ? err.message : 'Could not check what this change would pause.')
      })
  }

  async function confirmPlanChange() {
    if (!confirming) return
    const { plan } = confirming
    setPendingPlan(plan)
    setPlanError(null)
    try {
      await authApi.updatePlan(plan)
      // The header, limits and quota readouts all pick up the new plan.
      setConfirming(null)
      setPendingPlan(null)
      refresh()
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : 'Could not change the plan. Please try again.')
      setPendingPlan(null)
    }
  }

  if (!user || (variant === 'tenant' && !usage)) return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />

  const limits = PLAN_LIMITS[usage?.plan ?? user.plan]

  const currentPlan = usage?.plan ?? user.plan
  const payEnabled = prices?.enabled === true
  /** A paid period with an end date can be renewed; a plan staff set has none. */
  const renewable = payEnabled && currentPlan !== 'free' && Boolean(user.planExpiresAt)
  /** Renewals stop at 6 months paid ahead; the date Renew opens again, if it's closed now. */
  const renewOpensAt = (() => {
    if (!renewable || !prices?.maxAheadDays) return null
    const end = new Date(user.planExpiresAt!).getTime()
    const opens = end - (prices.maxAheadDays - prices.periodDays) * DAY_MS
    return opens > openedAt ? new Date(opens) : null
  })()
  const canRenew = renewable && renewOpensAt === null
  const isHigher = (plan: Plan) => PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(currentPlan)
  const priceOf = (plan: Plan) => formatRupiah(prices?.prices[plan] ?? 0)
  const activeUntil = user.planExpiresAt ? formatDate(user.planExpiresAt) : null
  const busy = payment.state.kind === 'starting' || payment.state.kind === 'confirming'
  const lastPaid = payments?.find((p) => p.status === 'paid') ?? null
  const waitingPayment = payment.state.kind === 'waiting' ? payment.state.payment : openPayment

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-center gap-lg">
        <span className="w-14 h-14 rounded-full shrink-0 bg-primary-soft text-primary text-section-title font-bold flex items-center justify-center">
          {(user.fullName || user.email).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-page-title font-bold text-text-primary break-words">{user.fullName || user.email}</h1>
          <p className="text-body text-text-secondary mt-xs break-all">
            {user.email}
          </p>
        </div>
        <Button variant="secondary" className="ml-auto">
          Edit profile
        </Button>
      </div>

      {/* Four tabs need ~410px; on a phone the row scrolls on its own instead of widening the page. */}
      <div className="flex gap-lg border-b border-border overflow-x-auto [scrollbar-width:none]">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={cn(
              'relative shrink-0 whitespace-nowrap pb-md text-body transition-colors',
              tab === item
                ? 'text-text-primary font-semibold after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-primary'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {variant === 'tenant' && (
        <PaymentProgress
          state={payment.state}
          open={openPayment}
          onResume={payment.resume}
          onCheck={(p) => void payment.confirm(p.orderId, p.plan)}
          onInvoice={(orderId) => void saveInvoice(orderId)}
          onRetry={(plan) => void payment.pay(plan)}
          onChangeMethod={(p) => {
            setOpenPayment(null)
            void payment.changeMethod(p)
          }}
          onDismiss={payment.reset}
        />
      )}

      {tab === 'Usage' && usage && (
        <div className="grid grid-cols-1 laptop:grid-cols-[1fr_320px] gap-xl items-start">
          <div className="space-y-lg">
            <Card className="p-lg">
              <h2 className="text-heading-sm text-text-primary mb-lg">Plan usage</h2>
              <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
                <UsageMeter label="Zones" value={usage.zonesCount} max={usage.zonesLimit} />
                <UsageMeter
                  label="Captures this month"
                  value={usage.pool.used}
                  max={usage.pool.limit}
                  sub={`Resets ${poolResetDay(usage.pool)}, 00:00 WIB`}
                />
                <UsageMeter
                  label="Scheduled a month"
                  value={usage.framesPerMonth}
                  max={usage.pool.limit}
                  note={
                    poolOutlook(usage.framesPerMonth, usage.pool).kind === 'short_this_month'
                      ? `More than the ${formatNumber(usage.pool.remaining)} left before ${poolResetDay(usage.pool)}: captures past that are skipped`
                      : poolOutlook(usage.framesPerMonth, usage.pool).kind === 'over_plan'
                        ? `More than your plan’s ${formatNumber(usage.pool.limit)} a month: captures past that are skipped`
                        : undefined
                  }
                />
                <UsageMeter label="Active windows" value={usage.schedulesActiveCount} max={usage.schedulesLimit} />
                <UsageMeter label="Storage" value={usage.storageUsedGb} max={usage.storageLimitGb} unit=" GB" />
              </div>
            </Card>

            <Card className="p-lg">
              <h2 className="text-heading-sm text-text-primary mb-md">What your plan includes</h2>
              <dl className="divide-y divide-divider">
                <AttributeRow label="Capture interval" value={limits.captureInterval} />
                <AttributeRow label="History kept" value={limits.historyLabel} />
                <AttributeRow label="Animation export" value={limits.exportLabel} />
                <AttributeRow label="Exports kept" value={`${limits.exportRetentionDays} days`} />
                <AttributeRow label="Road classes" value={ROAD_CLASS_LABEL[limits.maxRoadClass]} />
              </dl>
            </Card>
          </div>

          <div className="space-y-lg">
            <Card className="p-lg">
              <p className="text-micro font-semibold uppercase tracking-wide text-text-muted">Current plan</p>
              <p className="text-page-title font-bold text-text-primary mt-xs">{PLAN_LABEL[usage.plan]}</p>
              <p className="text-caption text-text-muted mt-xs">
                {PLAN_PRICE[usage.plan].amount} {PLAN_PRICE[usage.plan].period}
              </p>
              {activeUntil && <p className="text-caption text-text-secondary mt-xs">Active until {activeUntil}</p>}
              <Button variant="tint" className="w-full mt-lg" onClick={() => setPickerOpen(true)} disabled={busy}>
                Change plan
              </Button>
              {renewable && (
                <Button
                  variant="secondary"
                  className="w-full mt-sm"
                  onClick={() => startCheckout(usage.plan)}
                  disabled={busy || !canRenew}
                >
                  Renew {limitsPeriod(prices)} · {priceOf(usage.plan)}
                </Button>
              )}
              {renewOpensAt && (
                <p className="text-caption text-text-muted mt-xs">
                  Paid up to 6 months ahead. You can renew again from {formatDate(renewOpensAt)}.
                </p>
              )}
              {planError && !confirming && <p className="text-caption text-danger-text mt-sm">{planError}</p>}
            </Card>

            {usage.plan !== 'premium' && (
              <Card className="p-lg">
                <p className="text-micro font-semibold uppercase tracking-wide text-text-muted mb-md">Premium unlocks</p>
                <ul className="space-y-sm">
                  {PREMIUM_UNLOCKS.map((item) => (
                    <li key={item} className="flex items-start gap-sm text-body text-text-secondary">
                      <IconCheck className="text-success-icon mt-[3px]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'Payment & billing' && usage && (
        <div className="grid grid-cols-1 laptop:grid-cols-[1fr_320px] gap-xl items-start">
          <Card className="p-lg space-y-md">
            <h2 className="text-heading-sm text-text-primary">Billing history</h2>
            {/* Real payments only (FE-56); nothing is invented while there are none. */}
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Description</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Method</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Invoice</Th>
                  </tr>
                </thead>
                <tbody>
                  {!payments || payments.length === 0 ? (
                    <tr>
                      <Td colSpan={6} className="text-center text-text-muted py-xl">
                        {payments === null ? 'Loading…' : 'No payments yet'}
                      </Td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.orderId}>
                        <Td className="whitespace-nowrap tabular-nums">{formatDate(p.paidAt ?? p.createdAt)}</Td>
                        <Td>
                          {PLAN_LABEL[p.plan]}, {prices?.periodDays ?? 30} days
                          {p.periodEnd && <span className="block text-caption text-text-muted">Until {formatDate(p.periodEnd)}</span>}
                        </Td>
                        <Td className="text-right tabular-nums">{formatRupiah(p.amount)}</Td>
                        <Td className="text-text-secondary">{paymentTypeLabel(p.paymentType)}</Td>
                        <Td>
                          <StatusPill tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</StatusPill>
                        </Td>
                        <Td className="text-right">
                          {p.status === 'paid' || p.status === 'refunded' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void saveInvoice(p.orderId)}
                              disabled={invoiceBusy !== null}
                              aria-label={`Download invoice ${p.orderId}`}
                            >
                              {invoiceBusy === p.orderId ? 'Preparing…' : 'Download'}
                            </Button>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
            {invoiceError && <p className="text-caption text-danger-text">{invoiceError}</p>}
          </Card>

          <div className="space-y-lg">
            <Card className="p-lg space-y-md">
              <h2 className="text-heading-sm text-text-primary">Plan</h2>
              <dl className="divide-y divide-divider">
                <div className="flex items-center justify-between gap-md pb-md">
                  <dt className="text-body text-text-secondary">Plan</dt>
                  <dd>
                    <PlanPill plan={usage.plan} />
                  </dd>
                </div>
                <AttributeRow label="Price" value={`${PLAN_PRICE[usage.plan].amount} ${PLAN_PRICE[usage.plan].period}`} />
                <AttributeRow label="Active until" value={activeUntil ?? (usage.plan === 'free' ? '—' : 'No end date')} />
              </dl>
            </Card>

            <Card className="p-lg space-y-md">
              <h2 className="text-heading-sm text-text-primary">Payment method</h2>
              {!payEnabled ? (
                <p className="text-body text-text-muted">No card on file</p>
              ) : (
                <>
                  <p className="text-body text-text-secondary">
                    You choose the method each time you pay: QRIS, bank transfer, e-wallet or card.
                  </p>
                  {lastPaid?.paymentType && (
                    <AttributeRow label="Last paid with" value={paymentTypeLabel(lastPaid.paymentType)} />
                  )}
                  {waitingPayment && (
                    <div className="space-y-sm">
                      <p className="text-caption text-text-muted">
                        Waiting for {formatRupiah(waitingPayment.amount)}
                        {waitingPayment.paymentType ? ` by ${paymentTypeLabel(waitingPayment.paymentType)}` : ''}.
                      </p>
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={busy}
                        onClick={() => {
                          setOpenPayment(null)
                          void payment.changeMethod(waitingPayment)
                        }}
                      >
                        Change payment method
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>

            {prices?.autoRenewAvailable && usage.plan !== 'free' && (user.autoRenew || renewable) && (
              <AutoRenewCard
                plan={usage.plan}
                on={user.autoRenew === true}
                periodEnd={user.planExpiresAt ?? null}
                price={priceOf(usage.plan)}
                busy={busy}
                onEnable={() => void payment.pay(usage.plan, { autoRenew: true })}
                onChanged={refresh}
              />
            )}

            <Card className="p-lg space-y-md">
              <h2 className="text-heading-sm text-text-primary">Billing contact</h2>
              <p className="text-body font-semibold text-text-primary break-all">{user.email}</p>
            </Card>
          </div>
        </div>
      )}

      {tab === 'Account' && (
        <div className="space-y-lg">
          <Card className="p-lg">
            <dl className="divide-y divide-divider">
              <AttributeRow label="Full name" value={user.fullName || '—'} />
              <AttributeRow label="Email" value={user.email} />
            </dl>
          </Card>

          {user.role === 'internal' && (
            <Card className="p-lg">
              <h2 className="text-heading-sm text-text-primary">Staff tools</h2>
              <Link href="/internal" className={cn(buttonClass('tint'), 'mt-md')}>
                Open staff tools
              </Link>
            </Card>
          )}
        </div>
      )}

      {tab === 'Notifications' && <NotificationSettings variant={variant} />}

      {usage && (
        <>
          {/* Step 1: pick a plan. Moving down goes on to step 2, the warning. */}
          <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
              <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[76rem] max-h-[90vh] overflow-y-auto bg-page border border-border rounded-lg p-xl shadow-elevation-3 space-y-lg">
                <DialogCloseX />
                <Dialog.Title className="pr-xl text-section-title text-text-primary">Change plan</Dialog.Title>
                {intendedPlan && usage.plan !== intendedPlan && (
                  <Alert variant="info">
                    You picked {PLAN_LABEL[intendedPlan]}.{' '}
                    {payEnabled
                      ? `Pay below to switch; your account stays on ${PLAN_LABEL[usage.plan]} until the payment is confirmed.`
                      : `Payment is coming soon, and your account stays on ${PLAN_LABEL[usage.plan]} until then.`}
                  </Alert>
                )}
                <PlanCards
                  selected={usage.plan}
                  onSelect={(plan) => {
                    setPickerOpen(false)
                    // Up, or renewing a paid period: Midtrans. Down: the existing preview-and-confirm.
                    if (isHigher(plan) || plan === usage.plan) startCheckout(plan)
                    else changePlan(plan)
                  }}
                  pendingPlan={pendingPlan ?? (payment.state.kind === 'starting' ? payment.state.plan : null)}
                  // Without payments configured, upgrades are still arranged with the team.
                  disabledPlan={(plan) => isHigher(plan) && !payEnabled}
                  reselectable={canRenew}
                  actionLabel={(plan) =>
                    plan === usage.plan
                      ? canRenew
                        ? `Renew · ${priceOf(plan)}`
                        : renewOpensAt
                          ? 'Paid 6 months ahead'
                          : 'Current plan'
                      : isHigher(plan)
                        ? payEnabled
                          ? `Upgrade · ${priceOf(plan)}`
                          : 'Contact us to upgrade'
                        : `Move to ${PLAN_LABEL[plan]}`
                  }
                />
                <div className="flex justify-end">
                  <Dialog.Close className={buttonClass('secondary')}>Close</Dialog.Close>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>

          <CheckoutDialog
            open={checkout !== null}
            plan={checkout?.plan ?? null}
            openedAt={checkout?.at ?? 0}
            currentPlan={usage.plan}
            currentEnd={user.planExpiresAt ?? null}
            price={checkout ? (prices?.prices[checkout.plan] ?? 0) : 0}
            periodDays={prices?.periodDays ?? 30}
            onConfirm={(plan) => {
              setCheckout(null)
              void payment.pay(plan)
            }}
            onCancel={() => setCheckout(null)}
          />

          <PlanChangeDialog
            open={confirming !== null}
            title={confirming ? `Move to ${PLAN_LABEL[confirming.plan]}?` : ''}
            planLabel={confirming ? PLAN_LABEL[confirming.plan] : ''}
            impact={confirming?.impact ?? null}
            loading={confirming !== null && confirming.impact === null}
            pending={pendingPlan !== null}
            error={planError}
            onConfirm={confirmPlanChange}
            onCancel={() => setConfirming(null)}
          />
        </>
      )}
    </div>
  )
}


