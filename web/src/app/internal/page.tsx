'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { cn, formatDate } from '@/lib/utils'
import { PLAN_LABEL, PLAN_ORDER } from '@/lib/constants'
import * as internalApi from '@/features/internal/api'
import { configuredInternalEmails } from '@/features/auth/internal-access'
import { formatIdr } from '@/features/internal/api'
import type { InternalUserRow, PlatformStats } from '@/features/internal/types'
import type { Plan } from '@/features/auth/types'

const PLAN_BAR: Record<Plan, string> = {
  free: 'bg-canvas-secondary border border-border',
  standard: 'bg-primary-soft',
  premium: 'bg-primary',
}

export default function InternalOverviewPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [recent, setRecent] = useState<InternalUserRow[]>([])

  const load = useCallback(async () => {
    const [nextStats, rows] = await Promise.all([internalApi.getPlatformStats(), internalApi.getUserDirectory()])
    return { stats: nextStats, recent: rows.slice(0, 8) }
  }, [])

  const apply = useCallback((data: { stats: PlatformStats; recent: InternalUserRow[] }) => {
    setStats(data.stats)
    setRecent(data.recent)
  }, [])

  useEffect(() => {
    load().then(apply)
  }, [load, apply])

  if (!stats) {
    return (
      <div className="space-y-lg">
        <div className="h-8 w-64 bg-canvas-secondary rounded-md animate-pulse" />
        <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-canvas-secondary rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-canvas-secondary rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      <div>
        <p className="text-label text-text-secondary">Platform</p>
        <h1 className="text-page-title font-bold text-text-primary mt-xs">Overview</h1>
        <p className="text-body text-text-secondary mt-xs">
          Every account on the platform — not scoped to your own workspace.
        </p>
      </div>

      <Alert variant="warning">
        Zones, captures and storage are not tracked yet, so those figures read &quot;—&quot;. Account
        and plan numbers are live.
      </Alert>

      <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
        <StatTile label="Total accounts" value={stats.totalAccounts} note={`${stats.signupsLast7d} new in 7 days`} />
        <StatTile
          label="Internal users"
          value={stats.internalUsers}
          note={`${configuredInternalEmails().length} granted by env`}
        />
        <StatTile
          label="Zones collecting"
          value={stats.zonesTotal ?? '—'}
          note={stats.capturesTodayTotal === null ? 'not tracked yet' : `${stats.capturesTodayTotal} captures today`}
        />
        <StatTile
          label="Estimated MRR"
          value={formatIdr(stats.mrr)}
          note={stats.storageUsedGbTotal === null ? 'from plan mix' : `${stats.storageUsedGbTotal} GB stored`}
        />
      </div>

      <section>
        <h2 className="text-section-title text-text-primary mb-md">Plan mix</h2>
        <Card className="p-lg">
          <div className="flex h-3 rounded-full overflow-hidden gap-[2px]">
            {PLAN_ORDER.map((plan) => {
              const share = stats.totalAccounts > 0 ? (stats.byPlan[plan] / stats.totalAccounts) * 100 : 0
              if (share === 0) return null
              return (
                <div
                  key={plan}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', PLAN_BAR[plan])}
                  style={{ width: `${share}%` }}
                  title={`${PLAN_LABEL[plan]}: ${stats.byPlan[plan]}`}
                />
              )
            })}
          </div>
          <dl className="mt-lg grid grid-cols-1 tablet:grid-cols-3 gap-lg">
            {PLAN_ORDER.map((plan) => (
              <div key={plan} className="flex items-center gap-sm">
                <span className={cn('w-3 h-3 rounded-full shrink-0', PLAN_BAR[plan])} />
                <dt className="text-body text-text-secondary">{PLAN_LABEL[plan]}</dt>
                <dd className="ml-auto text-body font-semibold text-text-primary tabular-nums">{stats.byPlan[plan]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between mb-md">
          <h2 className="text-section-title text-text-primary">Recent signups</h2>
          <Link href="/internal/users" className="text-body text-info no-underline hover:underline">
            Manage users
          </Link>
        </div>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Organisation</Th>
                <Th>Plan</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id} className="hover:bg-canvas-secondary/60 transition-colors">
                  <Td>
                    <p className="font-semibold text-text-primary">
                      {row.fullName}
                      {row.isYou && <span className="ml-sm text-micro text-text-muted font-normal">You</span>}
                    </p>
                    <p className="text-caption text-text-muted">{row.email}</p>
                  </Td>
                  <Td className="text-text-secondary">{row.organisation || '—'}</Td>
                  <Td>
                    <span className="text-micro bg-canvas-secondary text-text-secondary border border-border rounded-xs px-sm py-xs">
                      {PLAN_LABEL[row.plan]}
                    </span>
                  </Td>
                  <Td>
                    {row.role === 'internal' ? (
                      <span className="text-micro bg-primary-soft text-[#5A35F3] rounded-xs px-sm py-xs font-semibold">Internal</span>
                    ) : (
                      <span className="text-micro text-text-muted">User</span>
                    )}
                  </Td>
                  <Td className="text-text-secondary">{formatDate(row.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </section>
    </div>
  )
}

function StatTile({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <Card className="p-lg">
      <p className="text-label text-text-secondary">{label}</p>
      <p className="text-display text-text-primary mt-xs tabular-nums">{value}</p>
      <p className="text-caption text-text-muted mt-sm">{note}</p>
    </Card>
  )
}
