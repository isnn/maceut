'use client'

import { AccountPlanPill, RolePill } from '@/components/ui/Badge'
import { useCallback, useEffect, useId, useState } from 'react'
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
import { cn, formatDate, formatFileSize, formatNumber } from '@/lib/utils'
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
        <StatTile
          label="Total accounts"
          value={stats.totalAccounts}
          note={`${stats.signupsLast7d} new in 7 days`}
          trend={{ days: stats.trend.days, values: stats.trend.signups, unit: (n) => `${n} ${n === 1 ? 'sign-up' : 'sign-ups'}` }}
        />
        <StatTile
          label="Internal users"
          value={stats.internalUsers}
          note={`${stats.internalByConfig} granted by config`}
        />
        <StatTile
          label="Zones collecting"
          value={stats.zonesTotal}
          note={`${stats.schedulesActiveTotal} active capture ${stats.schedulesActiveTotal === 1 ? 'window' : 'windows'}`}
          trend={{ days: stats.trend.days, values: stats.trend.zonesCreated, unit: (n) => `${n} new ${n === 1 ? 'zone' : 'zones'}` }}
        />
        <StatTile
          label="Captures today"
          value={formatNumber(stats.capturesTodayTotal ?? 0)}
          note="across every account, WIB day"
          trend={{ days: stats.trend.days, values: stats.trend.captures, unit: (n) => `${formatNumber(n)} captures` }}
        />
        <StatTile
          label="Storage used"
          value={`${formatNumber(stats.storageUsedGbTotal ?? 0, 2)} GB`}
          note="capture images, exports and cached frames"
          trend={{ days: stats.trend.days, values: stats.trend.storageAddedBytes, unit: (n) => `${formatFileSize(n)} added` }}
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

interface Trend {
  days: string[]
  values: number[]
  /** One day's value in words, for the bar's tooltip. */
  unit: (n: number) => string
}

function StatTile({ label, value, note, trend }: { label: string; value: string | number; note: string; trend?: Trend }) {
  return (
    <Card className="p-lg flex items-end justify-between gap-lg">
      <div className="min-w-0">
        <p className="text-label text-text-secondary">{label}</p>
        <p className="text-display text-text-primary mt-xs tabular-nums">{value}</p>
        <p className="text-caption text-text-muted mt-sm">{note}</p>
      </div>
      {trend && <TrendArea trend={trend} />}
    </Card>
  )
}

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  )
}

// Chart box in SVG units. Stretched to the element with preserveAspectRatio="none", so
// the line keeps a constant width (non-scaling-stroke) and the end dot is HTML.
const W = 100
const H = 40
const TOP = 4

/** What each of the last 7 WIB days added, as a line with a fading fill; today is the dot. */
function TrendArea({ trend }: { trend: Trend }) {
  const gradientId = `trend-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  // An API from before `trend` (or a mid-deploy mismatch) must cost the chart, not the page.
  if (!Array.isArray(trend.days) || !Array.isArray(trend.values) || trend.values.length < 2) return null

  const peak = Math.max(...trend.values, 1)
  const step = W / (trend.values.length - 1)
  const points = trend.values.map((v, i) => [i * step, H - (v / peak) * (H - TOP)] as const)
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const endY = points[points.length - 1]![1]

  return (
    <div
      className="relative w-[45%] max-w-[10rem] h-16 shrink-0 text-primary"
      role="img"
      aria-label={`Last 7 days: ${trend.values.map(trend.unit).join(', ')}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* One hover strip per day, for the date and value. */}
        {trend.values.map((v, i) => (
          <rect key={trend.days[i]} x={i * step - step / 2} y={0} width={step} height={H} fill="transparent">
            <title>{`${dayLabel(trend.days[i]!)}: ${trend.unit(v)}`}</title>
          </rect>
        ))}
      </svg>
      <span
        aria-hidden
        className="absolute right-0 w-2 h-2 -mr-1 -mt-1 rounded-full bg-primary ring-2 ring-card"
        style={{ top: `${(endY / H) * 100}%` }}
      />
    </div>
  )
}
