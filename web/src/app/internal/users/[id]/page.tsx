'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { EditUserDialog } from '@/features/internal/components/EditUserDialog'
import { DeleteUserDialog } from '@/features/internal/components/DeleteUserDialog'
import { VerifiedPill } from '@/features/internal/components/VerifiedPill'
import type { InternalUserRow } from '@/features/internal/types'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { AccountPlanPill, RoadClassBadge, RolePill, StatusPill } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { IconArrowLeft } from '@/components/ui/icons'
import { formatDate, formatNumber, formatWibShort } from '@/lib/utils'
import { PLAN_LABEL, PLAN_LIMITS, PLAN_PRICE } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { accessOf } from '@/features/auth/types'
import { DAY_LABEL } from '@/features/schedules/types'
import * as internalApi from '@/features/internal/api'
import type { RoadClass } from '@/features/zones/types'

const EVERY = { '15min': 'Every 15 min', hourly: 'Hourly', daily: 'Daily' } as const

/**
 * One account's usage for staff (FE-34) — a page rather than a modal, so it can be
 * linked, kept open beside a support ticket, and hold the account's zones and windows.
 * Every figure is measured by the server: storage (images + exports + cache), captures
 * today, exports this month, and captures per zone over the last 7 days.
 */
export default function InternalUserUsagePage() {
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<internalApi.AccountUsageDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { user: me } = useCurrentUser()
  // The same account actions as the Users list (superadmin only, FE-34); the server refuses admins too.
  const isSuperadmin = me ? accessOf(me) === 'superadmin' : false
  const [editing, setEditing] = useState<InternalUserRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Bumped after an edit, to read the account again.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!params?.id) return
    internalApi
      .getAccountUsage(params.id)
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError && err.code === 'NOT_FOUND' ? 'notfound' : 'Couldn’t load this account’s usage.'),
      )
  }, [params?.id, reloadKey])

  const back = (
    <Link
      href="/internal/users"
      className="inline-flex items-center gap-sm text-body text-text-secondary no-underline hover:text-text-primary transition-colors"
    >
      <IconArrowLeft size={16} />
      All users
    </Link>
  )

  if (error === 'notfound') {
    return (
      <div className="space-y-lg">
        {back}
        <EmptyState title="Account not found" description="It may have been deleted. Go back to the list to find another." />
      </div>
    )
  }
  if (error) {
    return (
      <div className="space-y-lg">
        {back}
        <Alert variant="warning">{error}</Alert>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-lg">
        {back}
        <div className="h-24 bg-canvas-secondary rounded-lg animate-pulse" />
        <div className="h-64 bg-canvas-secondary rounded-lg animate-pulse" />
      </div>
    )
  }

  const { user, usage, zones, windows, billing } = data
  const zoneHref = (zoneId: string) => `/internal/users/${encodeURIComponent(user.id)}/zones/${encodeURIComponent(zoneId)}`
  const limits = PLAN_LIMITS[user.plan]
  const paused = usage.pausedByPlan

  return (
    <div className="space-y-xl">
      {back}

      <div className="flex flex-wrap items-start gap-md">
        <div className="min-w-0">
          <h1 className="text-page-title font-bold text-text-primary truncate">{user.fullName || user.email}</h1>
          <p className="text-body text-text-secondary mt-xs">
            {user.email}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-sm">
          <AccountPlanPill access={accessOf(user)} plan={user.plan} />
          <RolePill role={user.role} />
          <VerifiedPill verified={user.emailVerified ?? false} />
          {isSuperadmin && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditing(internalApi.rowFromDetail(data, me?.id))}>
                Edit account
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleting(true)}
                disabled={user.id === me?.id}
                title={user.id === me?.id ? 'You can’t delete your own account' : undefined}
              >
                Delete account
              </Button>
            </>
          )}
        </div>
      </div>

      <EditUserDialog row={editing} onClose={() => setEditing(null)} onSaved={() => setReloadKey((k) => k + 1)} />
      <DeleteUserDialog
        target={
          deleting
            ? {
                id: user.id,
                fullName: user.fullName || user.email,
                email: user.email,
                zones: usage.zonesCount + paused.zones,
                windows: usage.schedulesActiveCount + paused.schedules,
              }
            : null
        }
        onClose={() => setDeleting(false)}
        onDeleted={() => router.push('/internal/users')}
      />

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">Usage</h2>
        <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
          <StatTile label="Zones" value={usage.zonesCount} max={usage.zonesLimit} note={paused.zones > 0 ? `${paused.zones} paused by plan` : undefined} />
          <StatTile
            label="Active windows"
            value={usage.schedulesActiveCount}
            max={usage.schedulesLimit}
            note={paused.schedules > 0 ? `${paused.schedules} paused by plan` : undefined}
          />
          <StatTile
            label="Captures this month"
            value={usage.pool.used}
            max={usage.pool.limit}
            note={`${formatNumber(usage.pool.remaining)} left`}
          />
          <StatTile label="Storage" value={usage.storageUsedGb} max={usage.storageLimitGb} unit="GB" decimals={2} />
        </div>
        <Card className="p-lg">
          <dl className="grid grid-cols-2 laptop:grid-cols-4 gap-lg">
            <Fact label="Exports this month" value={formatNumber(usage.exportsThisMonth)} />
            <Fact label="Scheduled a month" value={`${formatNumber(usage.framesPerMonth)} / ${formatNumber(usage.pool.limit)}`} />
            <Fact label="Capture interval" value={limits.captureInterval} />
            <Fact label="History kept" value={limits.historyLabel} />
          </dl>
        </Card>
      </section>

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">Zones</h2>
        {zones.length === 0 ? (
          <EmptyState title="No zones yet" description="This account hasn’t drawn a zone." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Zone</Th>
                  <Th>Road class</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Captures, 7 days</Th>
                  <Th>Created</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id} className="hover:bg-canvas-secondary/60 transition-colors">
                    <Td>
                      <Link href={zoneHref(z.id)} className="font-semibold text-text-primary no-underline hover:text-primary transition-colors">
                        {z.name}
                      </Link>
                    </Td>
                    <Td>
                      <RoadClassBadge roadClass={z.roadClass as RoadClass} />
                    </Td>
                    <Td>
                      <StatusPill tone={z.status === 'collecting' ? 'success' : z.pausedByPlan ? 'warning' : 'neutral'}>
                        {z.status === 'collecting' ? 'Collecting' : 'Paused'}
                      </StatusPill>
                    </Td>
                    <Td className="text-right tabular-nums">{formatNumber(z.capturesLast7Days)}</Td>
                    <Td className="text-text-secondary whitespace-nowrap">{formatDate(z.createdAt)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end">
                        <ActionMenu label={`Actions for ${z.name}`} items={[{ label: 'View zone', onSelect: () => router.push(zoneHref(z.id)) }]} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">Capture windows</h2>
        {windows.length === 0 ? (
          <EmptyState title="No capture windows" description="Nothing is scheduled on this account." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Window</Th>
                  <Th>Zone</Th>
                  <Th>Hours (WIB)</Th>
                  <Th>Days</Th>
                  <Th>Interval</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.id} className="hover:bg-canvas-secondary/60 transition-colors">
                    <Td className="font-semibold text-text-primary">{w.label}</Td>
                    <Td>
                      <Link href={zoneHref(w.zoneId)} className="text-text-secondary no-underline hover:text-primary transition-colors">
                        {w.zoneName}
                      </Link>
                    </Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {w.start}–{w.end}
                    </Td>
                    <Td className="text-text-secondary whitespace-nowrap">
                      {w.days.length === 7 ? 'Every day' : w.days.map((d) => DAY_LABEL[d]).join(' ')}
                    </Td>
                    <Td className="text-text-secondary">{EVERY[w.interval]}</Td>
                    <Td>
                      <StatusPill tone={w.status === 'active' ? 'success' : w.pausedByPlan ? 'warning' : 'neutral'}>
                        {w.status === 'active' ? 'Active' : 'Paused'}
                      </StatusPill>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end">
                        <ActionMenu label={`Actions for ${w.label}`} items={[{ label: 'View zone', onSelect: () => router.push(zoneHref(w.zoneId)) }]} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>

      <BillingSection billing={billing} isStaff={accessOf(user) !== 'user'} />
    </div>
  )
}

/**
 * Billing (no payments yet): the plan and its price, since when it applies, and every
 * change that led to it. Online payment is not open, so plans are moved by staff; the
 * history says who.
 */
function BillingSection({ billing, isStaff }: { billing: internalApi.AccountUsageDetail['billing']; isStaff: boolean }) {
  const price = PLAN_PRICE[billing.plan]
  return (
    <section className="space-y-md">
      <h2 className="text-section-title text-text-primary">Billing</h2>
      <Card className="p-lg">
        <dl className="grid grid-cols-2 laptop:grid-cols-4 gap-lg">
          <Fact label="Plan" value={isStaff ? `${PLAN_LABEL[billing.plan]} (staff account)` : PLAN_LABEL[billing.plan]} />
          <Fact label="Price" value={`${price.amount} ${price.period}`} />
          <Fact label="On this plan since" value={billing.startedAt ? formatDate(billing.startedAt) : '—'} />
          <Fact label="Renews / expires" value={billing.expiresAt ? formatDate(billing.expiresAt) : 'No end date'} />
        </dl>
        <p className="text-caption text-text-muted mt-lg">Online payment isn’t open yet. Plans are changed by staff.</p>
      </Card>

      <h3 className="text-label text-text-secondary">Plan history</h3>
      {billing.history.length === 0 ? (
        <EmptyState title="No plan changes recorded" description="Changes are recorded from 16 Oct 2026." />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>When (WIB)</Th>
                <Th>Change</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {billing.history.map((h) => (
                <tr key={h.id}>
                  <Td className="tabular-nums whitespace-nowrap">{formatWibShort(h.createdAt)}</Td>
                  <Td className="whitespace-nowrap">
                    {h.fromPlan === null ? (
                      <>Created on <span className="font-semibold text-text-primary">{PLAN_LABEL[h.toPlan]}</span></>
                    ) : (
                      <>
                        {PLAN_LABEL[h.fromPlan]} &rarr; <span className="font-semibold text-text-primary">{PLAN_LABEL[h.toPlan]}</span>
                      </>
                    )}
                  </Td>
                  <Td className="text-text-secondary">
                    {h.source === 'self' ? 'The customer' : (h.changedBy ?? 'Staff')}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  )
}

/**
 * One quota as a tile: the figure large, the plan's limit beside it, a bar that turns
 * amber near the limit, and a note for what a plan change paused.
 */
function StatTile({
  label,
  value,
  max,
  unit,
  decimals = 0,
  note,
}: {
  label: string
  value: number
  max: number
  unit?: string
  decimals?: number
  note?: string
}) {
  const share = max > 0 ? value / max : 0
  return (
    <Card className="p-lg space-y-sm">
      <div className="flex items-baseline justify-between gap-sm">
        <p className="text-label text-text-secondary">{label}</p>
        <p className="text-caption text-text-muted tabular-nums">{Math.round(share * 100)}%</p>
      </div>
      <p className="text-display text-text-primary tabular-nums leading-none">
        {formatNumber(value, decimals)}
        <span className="text-body text-text-muted font-normal">
          {' '}
          / {formatNumber(max)}
          {unit ? ` ${unit}` : ''}
        </span>
      </p>
      <ProgressBar value={value} max={max} />
      {note && <p className="text-caption font-semibold text-warning-text">{note}</p>}
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body font-semibold text-text-primary mt-xs truncate">{value}</dd>
    </div>
  )
}
