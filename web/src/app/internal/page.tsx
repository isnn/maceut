'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { Pagination, SortableTh, Table, TableWrap, Td } from '@/components/ui/Table'
import { useTableControls } from '@/components/ui/useTableControls'
import { Input } from '@/components/ui/Input'
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
  const [accounts, setAccounts] = useState<InternalUserRow[] | null>(null)

  const load = useCallback(async () => {
    const [nextStats, rows] = await Promise.all([internalApi.getPlatformStats(), internalApi.getUserDirectory()])
    return { stats: nextStats, accounts: rows }
  }, [])

  const apply = useCallback((data: { stats: PlatformStats; accounts: InternalUserRow[] }) => {
    setStats(data.stats)
    setAccounts(data.accounts)
  }, [])

  useEffect(() => {
    load().then(apply)
  }, [load, apply])

  // Was a fixed "8 most recent" list, which could not answer any question beyond who
  // signed up last. Same three controls as every other table now, so the overview can
  // actually be used to find an account without leaving the page.
  const table = useTableControls<InternalUserRow>({
    rows: accounts,
    searchOn: (row) => [row.fullName, row.email],
    sortOn: {
      account: (row) => row.fullName.toLowerCase(),
      zones: (row) => row.usage.zonesCount,
      plan: (row) => PLAN_ORDER.indexOf(row.plan),
      role: (row) => row.role,
      joined: (row) => row.createdAt,
    },
    defaultDirection: { zones: 'desc', joined: 'desc' },
    initialSort: { key: 'joined', direction: 'desc' },
    pageSize: 8,
  })

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
          Every account on the platform, not just your own.
        </p>
      </div>

      <Alert variant="warning">
        Captures and storage aren&rsquo;t tracked yet, so those read &quot;—&quot;. Accounts, plans, zones and
        capture windows are live.
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
          value={stats.zonesTotal}
          note={`${stats.schedulesActiveTotal} active capture ${stats.schedulesActiveTotal === 1 ? 'window' : 'windows'}`}
        />
        <StatTile
          label="Estimated MRR"
          value={formatIdr(stats.mrr)}
          note="from plan mix · excludes internal"
        />
      </div>

      <section className="space-y-md">
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
        <div className="flex flex-wrap items-center justify-between gap-md mb-md">
          <h2 className="text-section-title text-text-primary">Accounts</h2>
          <div className="flex items-center gap-md ml-auto">
            <Input
              type="search"
              placeholder="Search name or email…"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              className="w-full tablet:w-64"
            />
            <Link href="/internal/users" className="text-body text-info no-underline hover:underline whitespace-nowrap">
              Manage users
            </Link>
          </div>
        </div>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <SortableTh
                  active={table.sort?.key === 'account'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('account')}
                >
                  Account
                </SortableTh>
                <SortableTh
                  className="text-right"
                  active={table.sort?.key === 'zones'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('zones')}
                >
                  Zones
                </SortableTh>
                <SortableTh
                  active={table.sort?.key === 'plan'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('plan')}
                >
                  Plan
                </SortableTh>
                <SortableTh
                  active={table.sort?.key === 'role'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('role')}
                >
                  Role
                </SortableTh>
                <SortableTh
                  active={table.sort?.key === 'joined'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('joined')}
                >
                  Joined
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {table.visible.map((row) => (
                <tr key={row.id} className="hover:bg-canvas-secondary/60 transition-colors">
                  <Td>
                    <p className="font-semibold text-text-primary">
                      {row.fullName}
                      {row.isYou && <span className="ml-sm text-micro text-text-muted font-normal">You</span>}
                    </p>
                    <p className="text-caption text-text-muted">{row.email}</p>
                  </Td>
                  <Td className="text-right tabular-nums text-text-secondary">
                    {row.usage.zonesCount}
                    {row.usage.zonesPaused > 0 && (
                      <span className="text-micro text-warning-text ml-sm">{row.usage.zonesPaused} paused</span>
                    )}
                  </Td>
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
          <Pagination
            page={table.page}
            pageCount={table.pageCount}
            pageSize={table.pageSize}
            onPage={table.setPage}
            matchCount={table.matchCount}
            totalCount={table.totalCount}
            noun="accounts"
            onClearSearch={table.search ? () => table.setSearch('') : undefined}
          />
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
