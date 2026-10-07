'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { AccountPlanPill, RoadClassBadge, RolePill, StatusPill } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { IconArrowLeft } from '@/components/ui/icons'
import { formatDate, formatNumber } from '@/lib/utils'
import { PLAN_LIMITS } from '@/lib/constants'
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

  useEffect(() => {
    if (!params?.id) return
    internalApi
      .getAccountUsage(params.id)
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError && err.code === 'NOT_FOUND' ? 'notfound' : 'Couldn’t load this account’s usage.'),
      )
  }, [params?.id])

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

  const { user, usage, zones, windows } = data
  const limits = PLAN_LIMITS[user.plan]
  const paused = usage.pausedByPlan

  return (
    <div className="space-y-xl">
      {back}

      <div className="flex flex-wrap items-start gap-md">
        <div className="min-w-0">
          <h1 className="text-page-title font-bold text-text-primary truncate">{user.fullName || user.email}</h1>
          <p className="text-body text-text-secondary mt-xs">
            {user.email} · joined {formatDate(user.createdAt)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-sm">
          <AccountPlanPill access={accessOf(user)} plan={user.plan} />
          <RolePill role={user.role} />
        </div>
      </div>

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
          <StatTile label="Captures today" value={usage.capturesToday ?? 0} max={usage.capturesLimit} />
          <StatTile label="Storage" value={usage.storageUsedGb} max={usage.storageLimitGb} unit="GB" decimals={2} />
        </div>
        <Card className="p-lg">
          <dl className="grid grid-cols-2 laptop:grid-cols-4 gap-lg">
            <Fact label="Exports this month" value={formatNumber(usage.exportsThisMonth)} />
            <Fact label="Snapshots a day" value={`${formatNumber(usage.framesPerDay)} / ${formatNumber(usage.capturesLimit)}`} />
            <Fact label="Capture interval" value={limits.captureInterval} />
            <Fact label="History kept" value={limits.historyLabel} />
          </dl>
        </Card>
      </section>

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">Zones · {zones.length}</h2>
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
                  <Th className="text-right">Captures · 7 days</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <Td className="font-semibold text-text-primary">{z.name}</Td>
                    <Td>
                      <RoadClassBadge roadClass={z.roadClass as RoadClass} />
                    </Td>
                    <Td>
                      <StatusPill tone={z.status === 'collecting' ? 'success' : z.pausedByPlan ? 'warning' : 'neutral'}>
                        {z.status === 'collecting' ? 'Collecting' : z.pausedByPlan ? 'Paused · plan limit' : 'Paused'}
                      </StatusPill>
                    </Td>
                    <Td className="text-right tabular-nums">{formatNumber(z.capturesLast7Days)}</Td>
                    <Td className="text-text-secondary whitespace-nowrap">{formatDate(z.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">Capture windows · {windows.length}</h2>
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
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.id}>
                    <Td className="font-semibold text-text-primary">{w.label}</Td>
                    <Td className="text-text-secondary">{w.zoneName}</Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {w.start}–{w.end}
                    </Td>
                    <Td className="text-text-secondary whitespace-nowrap">
                      {w.days.length === 7 ? 'Every day' : w.days.map((d) => DAY_LABEL[d]).join(' ')}
                    </Td>
                    <Td className="text-text-secondary">{EVERY[w.interval]}</Td>
                    <Td>
                      <StatusPill tone={w.status === 'active' ? 'success' : w.pausedByPlan ? 'warning' : 'neutral'}>
                        {w.status === 'active' ? 'Active' : w.pausedByPlan ? 'Paused · plan limit' : 'Paused'}
                      </StatusPill>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>
    </div>
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
