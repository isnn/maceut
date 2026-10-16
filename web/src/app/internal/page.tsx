'use client'

import { AccountPlanPill, RolePill } from '@/components/ui/Badge'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { EditUserDialog } from '@/features/internal/components/EditUserDialog'
import { DeleteUserDialog } from '@/features/internal/components/DeleteUserDialog'
import { VerifiedPill } from '@/features/internal/components/VerifiedPill'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { accessOf } from '@/features/auth/types'
import { Card } from '@/components/ui/Card'
import { linkClass } from '@/components/ui/Button'
import { Pagination, SortableTh, Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { useTableControls } from '@/components/ui/useTableControls'
import { Input } from '@/components/ui/Input'
import { cn, formatDate, formatNumber } from '@/lib/utils'
import { PLAN_LABEL, PLAN_ORDER } from '@/lib/constants'
import * as internalApi from '@/features/internal/api'
import { formatIdr } from '@/features/internal/api'
import type { InternalUserRow, PlatformStats } from '@/features/internal/types'
import type { Plan } from '@/features/auth/types'

const PLAN_BAR: Record<Plan, string> = {
  free: 'bg-canvas-secondary border border-border',
  starter: 'bg-primary-soft/50',
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
  const refetch = useCallback(() => load().then(apply), [load, apply])

  // The same row actions as the Users page; edit and delete are superadmin only (FE-34).
  const router = useRouter()
  const { user: me } = useCurrentUser()
  const isSuperadmin = me ? accessOf(me) === 'superadmin' : false
  const [editing, setEditing] = useState<InternalUserRow | null>(null)
  const [deleting, setDeleting] = useState<InternalUserRow | null>(null)

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
      verified: (row) => (row.emailVerified ? 1 : 0),
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
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-3 gap-lg">
        <StatTile label="Total accounts" value={stats.totalAccounts} note={`${stats.signupsLast7d} new in 7 days`} />
        <StatTile
          label="Internal users"
          value={stats.internalUsers}
          note={`${stats.internalByConfig} granted by config`}
        />
        <StatTile
          label="Zones collecting"
          value={stats.zonesTotal}
          note={`${stats.schedulesActiveTotal} active capture ${stats.schedulesActiveTotal === 1 ? 'window' : 'windows'}`}
        />
        <StatTile
          label="Captures today"
          value={formatNumber(stats.capturesTodayTotal ?? 0)}
          note="across every account, WIB day"
        />
        <StatTile
          label="Storage used"
          value={`${formatNumber(stats.storageUsedGbTotal ?? 0, 2)} GB`}
          note="capture images, exports and cached frames"
        />
        <StatTile
          label="Estimated MRR"
          value={formatIdr(stats.mrr)}
          note="from plan mix"
        />
      </div>

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">Plan mix</h2>
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
          <dl className="mt-lg grid grid-cols-2 tablet:grid-cols-4 gap-lg">
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

      <section className="space-y-md">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <h2 className="text-section-title text-text-primary">Accounts</h2>
          <div className="flex items-center gap-md ml-auto">
            <Input
              type="search"
              placeholder="Search name or email…"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              className="w-full tablet:w-64"
            />
            <Link href="/internal/users" className={cn(linkClass(), 'whitespace-nowrap')}>
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
                  active={table.sort?.key === 'verified'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('verified')}
                >
                  Verified
                </SortableTh>
                <SortableTh
                  active={table.sort?.key === 'joined'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('joined')}
                >
                  Joined
                </SortableTh>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {table.visible.map((row) => (
                <tr key={row.id} className="hover:bg-canvas-secondary/60 transition-colors">
                  <Td>
                    <Link
                      href={`/internal/users/${encodeURIComponent(row.id)}`}
                      className="font-semibold text-text-primary no-underline hover:text-primary transition-colors"
                    >
                      {row.fullName}
                      {row.isYou && <span className="ml-sm text-micro text-text-muted font-normal">You</span>}
                    </Link>
                    <p className="text-caption text-text-muted">{row.email}</p>
                  </Td>
                  <Td className="text-right tabular-nums text-text-secondary">
                    {row.usage.zonesCount}
                    <span className="text-text-muted">/{row.usage.zonesLimit}</span>
                  </Td>
                  <Td>
                    <AccountPlanPill access={row.access} plan={row.plan} />
                  </Td>
                  <Td>
                    <RolePill role={row.role} />
                  </Td>
                  <Td>
                    <VerifiedPill verified={row.emailVerified} />
                  </Td>
                  <Td className="text-text-secondary whitespace-nowrap">{formatDate(row.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end">
                      <ActionMenu
                        label={`Actions for ${row.fullName}`}
                        items={[
                          { label: 'View usage', onSelect: () => router.push(`/internal/users/${encodeURIComponent(row.id)}`) },
                          ...(isSuperadmin
                            ? [
                                { label: 'Edit account', onSelect: () => setEditing(row) },
                                { label: 'Delete account', destructive: true, disabled: row.isYou, onSelect: () => setDeleting(row) },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  </Td>
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

      <EditUserDialog row={editing} onClose={() => setEditing(null)} onSaved={refetch} />
      <DeleteUserDialog
        target={
          deleting && {
            id: deleting.id,
            fullName: deleting.fullName,
            email: deleting.email,
            zones: deleting.usage.zonesCount + deleting.usage.zonesPaused,
            windows: deleting.usage.schedulesActiveCount + deleting.usage.schedulesPaused,
          }
        }
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null)
          refetch()
        }}
      />
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
