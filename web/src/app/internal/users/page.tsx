'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { Pagination, SortableTh, Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { useTableControls } from '@/components/ui/useTableControls'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PlanChangeDialog } from '@/features/plan/PlanChangeDialog'
import { previewAccountPlanChange, type PlanImpact } from '@/features/plan/impact'
import { EmptyState } from '@/components/shared/EmptyState'
import { AddUserDialog } from '@/features/internal/components/AddUserDialog'
import { EditUserDialog } from '@/features/internal/components/EditUserDialog'
import { formatDate } from '@/lib/utils'
import { PLAN_LABEL, PLAN_ORDER } from '@/lib/constants'
import { ApiError } from '@/types/api'
import * as internalApi from '@/features/internal/api'
import type { InternalUserRow } from '@/features/internal/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { PausedCell } from '@/features/internal/components/PausedCell'
import { accessOf, type Access, type Plan, type PlatformRole } from '@/features/auth/types'


export default function InternalUsersPage() {
  const [rows, setRows] = useState<InternalUserRow[] | null>(null)
  const [planFilter, setPlanFilter] = useState<Plan | 'all'>('all')
  const [roleFilter, setRoleFilter] = useState<PlatformRole | 'all'>('all')
  const router = useRouter()
  const { user: me } = useCurrentUser()
  /** FE-34: admins help customers (plans); superadmins also manage accounts and staff. */
  const isSuperadmin = me ? accessOf(me) === 'superadmin' : false
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [downgrade, setDowngrade] = useState<{ row: InternalUserRow; plan: Plan; impact: PlanImpact | null } | null>(null)
  const [downgradePending, setDowngradePending] = useState(false)
  const [downgradeError, setDowngradeError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<InternalUserRow | null>(null)
  const [deleting, setDeleting] = useState<InternalUserRow | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const load = useCallback(() => internalApi.getUserDirectory(), [])
  const refetch = useCallback(() => load().then(setRows), [load])

  useEffect(() => {
    load().then(setRows)
  }, [load])

  // The plan and role dropdowns narrow the set before search, sort and paging run, so
  // "showing 4 of 12" counts within the filter rather than across the whole directory.
  const filtered = useMemo(
    () =>
      rows?.filter(
        (row) =>
          (planFilter === 'all' || row.plan === planFilter) && (roleFilter === 'all' || row.role === roleFilter),
      ) ?? null,
    [rows, planFilter, roleFilter],
  )

  const table = useTableControls<InternalUserRow>({
    rows: filtered,
    searchOn: (row) => [row.fullName, row.email],
    sortOn: {
      name: (row) => row.fullName.toLowerCase(),
      // Staff sort after customers, Admin before Superadmin.
      plan: (row) => (row.access === 'user' ? PLAN_ORDER.indexOf(row.plan) : row.access === 'admin' ? 10 : 11),
      role: (row) => row.role,
      zones: (row) => row.usage.zonesCount,
      paused: (row) => row.usage.zonesPaused + row.usage.schedulesPaused,
      windows: (row) => row.usage.schedulesActiveCount,
      captures: (row) => row.usage.capturesToday,
      joined: (row) => row.createdAt,
    },
    initialSort: { key: 'joined', direction: 'desc' },
  })
  const visible = table.visible

  const superadminCount = rows?.filter((r) => r.access === 'superadmin').length ?? 0

  async function changeRole(row: InternalUserRow, role: Access) {
    setError(null)
    try {
      await internalApi.setUserRole(row.id, role)
      refetch()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      refetch()
    }
  }

  async function changePlan(row: InternalUserRow, plan: Plan) {
    setError(null)
    // Lowering a tier can put an account over its new limits — confirm first.
    if (PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf(row.plan)) {
      // Ask the server exactly what this would pause — the same function the change
      // runs. The old dialog guessed from counts in the browser and couldn't see
      // intervals or daily frame budgets.
      setDowngradeError(null)
      setDowngrade({ row, plan, impact: null })
      previewAccountPlanChange(row.id, plan)
        .then((impact) => setDowngrade((d) => (d && d.row.id === row.id && d.plan === plan ? { ...d, impact } : d)))
        .catch((err) => setDowngradeError(err instanceof ApiError ? err.message : 'Could not preview this change.'))
      return
    }
    await internalApi.setUserPlan(row.id, plan)
    refetch()
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setError(null)
    try {
      const res = await internalApi.deleteUser(deleting.id)
      setDeleting(null)
      refetch()
      // Say what actually went, rather than leaving the operator to wonder what they
      // just destroyed. The server counts it before deleting, so this is measured.
      setNotice(
        `Deleted ${res.deleted.email}` +
          (res.removed.zones || res.removed.schedules
            ? ` · ${res.removed.zones} zones and ${res.removed.schedules} capture windows removed`
            : ''),
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the account. Please try again.')
    } finally {
      setDeletePending(false)
    }
  }

  async function confirmDowngrade() {
    if (!downgrade) return
    setDowngradePending(true)
    setDowngradeError(null)
    try {
      await internalApi.setUserPlan(downgrade.row.id, downgrade.plan)
      setDowngrade(null)
      refetch()
    } catch (err) {
      setDowngradeError(err instanceof ApiError ? err.message : 'Could not change the plan.')
    } finally {
      setDowngradePending(false)
    }
  }


  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-start gap-lg">
        <div>
          <p className="text-label text-text-secondary">Platform · {rows?.length ?? 0} accounts</p>
          <h1 className="text-page-title font-bold text-text-primary mt-xs">Users</h1>
          <p className="text-body text-text-secondary mt-xs max-w-[70ch]">
            {isSuperadmin
              ? 'Create an account, change a customer’s plan, or grant staff access. You can’t change your own access, and the last superadmin can’t be demoted.'
              : 'Look up an account, see its usage, or change a customer’s plan. Account and staff changes are made by a superadmin.'}
          </p>
        </div>
        {isSuperadmin && (
          <Button className="ml-auto shrink-0" onClick={() => setAdding(true)}>
            Add user
          </Button>
        )}
      </div>

      {error && <Alert variant="warning">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-md">
        <Input
          type="search"
          placeholder="Search name or email…"
          value={table.search}
          onChange={(e) => table.setSearch(e.target.value)}
          className="w-full tablet:w-80"
        />
        <Select
          value={planFilter}
          onValueChange={(v) => setPlanFilter(v as Plan | 'all')}
          options={[
            { value: 'all', label: 'All plans' },
            ...PLAN_ORDER.map((plan) => ({ value: plan, label: PLAN_LABEL[plan] })),
          ]}
          className="w-44"
          aria-label="Filter by plan"
        />
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as PlatformRole | 'all')}
          options={[
            { value: 'all', label: 'All roles' },
            { value: 'user', label: 'Customer' },
            { value: 'internal', label: 'Internal' },
          ]}
          className="w-44"
          aria-label="Filter by role"
        />
      </div>

      {table.loading ? (
        <div className="h-64 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : visible.length === 0 ? (
        <EmptyState title="No accounts match" description="Try a different filter or search term." />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <SortableTh
                  active={table.sort?.key === 'name'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('name')}
                >
                  Person
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
                  className="text-right"
                  active={table.sort?.key === 'zones'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('zones')}
                >
                  Zones
                </SortableTh>
                <SortableTh
                  className="text-right"
                  active={table.sort?.key === 'paused'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('paused')}
                >
                  Paused
                </SortableTh>
                <SortableTh
                  className="text-right"
                  active={table.sort?.key === 'windows'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('windows')}
                >
                  Windows
                </SortableTh>
                <SortableTh
                  className="text-right"
                  active={table.sort?.key === 'captures'}
                  direction={table.sort?.direction ?? 'asc'}
                  onSort={() => table.toggleSort('captures')}
                >
                  Captures
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
              {visible.map((row) => {
                const byConfig = row.roleLockedByConfig
                const isLastSuperadmin = row.access === 'superadmin' && superadminCount <= 1
                const roleLocked = !isSuperadmin || row.isYou || isLastSuperadmin || byConfig
                const lockReason = !isSuperadmin
                  ? 'Only a superadmin can change this'
                  : byConfig
                    ? 'Superadmin through INTERNAL_EMAILS in the server config — change it there'
                    : row.isYou
                      ? 'You can’t change your own access'
                      : isLastSuperadmin
                        ? 'The last superadmin can’t be demoted'
                        : undefined
                return (
                  <tr key={row.id} className="hover:bg-canvas-secondary/60 transition-colors">
                    <Td>
                      <div className="flex items-center gap-md">
                        <span className="w-9 h-9 rounded-full bg-primary-soft text-[#5A35F3] text-label font-bold flex items-center justify-center shrink-0">
                          {row.fullName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/internal/users/${encodeURIComponent(row.id)}`}
                            className="block font-semibold text-text-primary truncate no-underline hover:text-primary transition-colors"
                          >
                            {row.fullName}
                            {row.isYou && <span className="ml-sm text-micro text-text-muted font-normal">You</span>}
                          </Link>
                          <p className="text-caption text-text-muted truncate">{row.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {/* Internal staff have no customer plan: their plan is Admin or Superadmin (FE-34). */}
                      {row.role === 'internal' ? (
                        <Select
                          size="sm"
                          value={row.access}
                          disabled={roleLocked}
                          title={lockReason}
                          onValueChange={(v) => changeRole(row, v as Access)}
                          options={[
                            { value: 'admin', label: 'Admin' },
                            { value: 'superadmin', label: 'Superadmin' },
                          ]}
                          className="w-36"
                          aria-label={`Staff plan for ${row.fullName}`}
                        />
                      ) : (
                        <Select
                          size="sm"
                          value={row.plan}
                          onValueChange={(v) => changePlan(row, v as Plan)}
                          options={PLAN_ORDER.map((plan) => ({ value: plan, label: PLAN_LABEL[plan] }))}
                          className="w-36"
                          aria-label={`Plan for ${row.fullName}`}
                        />
                      )}
                    </Td>
                    <Td>
                      <Select
                        size="sm"
                        value={row.role}
                        disabled={roleLocked}
                        title={lockReason}
                        // Customer ↔ Internal. A new internal account starts as Admin, the lesser plan.
                        onValueChange={(v) => changeRole(row, v === 'internal' ? 'admin' : 'user')}
                        options={[
                          { value: 'user', label: 'Customer' },
                          { value: 'internal', label: 'Internal' },
                        ]}
                        className="w-32"
                        aria-label={`Role for ${row.fullName}`}
                      />
                      {byConfig && <p className="text-micro text-text-muted mt-xs">set by env</p>}
                    </Td>
                    <Td className="text-right tabular-nums text-text-secondary whitespace-nowrap">
                      {row.usage.zonesCount}
                      <span className="text-text-muted">/{row.usage.zonesLimit}</span>
                    </Td>
                    <Td className="text-right">
                      <PausedCell zones={row.usage.zonesPaused} windows={row.usage.schedulesPaused} />
                    </Td>
                    <Td className="text-right tabular-nums text-text-secondary whitespace-nowrap">
                      {row.usage.schedulesActiveCount}
                      <span className="text-text-muted">/{row.usage.schedulesLimit}</span>
                    </Td>
                    <Td className="text-right tabular-nums text-text-secondary whitespace-nowrap">
                      {row.usage.capturesToday ?? <span className="text-text-muted">&mdash;</span>}
                      <span className="text-text-muted">/{row.usage.capturesLimit}</span>
                    </Td>
                    <Td className="text-text-secondary whitespace-nowrap">{formatDate(row.createdAt)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="flex justify-end">
                        <ActionMenu
                          label={`Actions for ${row.fullName}`}
                          items={[
                            { label: 'View usage', onSelect: () => router.push(`/internal/users/${encodeURIComponent(row.id)}`) },
                            // Superadmin only (FE-34) — the server refuses admins too.
                            ...(isSuperadmin
                              ? [
                                  { label: 'Edit account', onSelect: () => setEditing(row) },
                                  {
                                    label: 'Delete account',
                                    destructive: true,
                                    // Refused by the server too; disabling here explains why up front
                                    // rather than after a 403.
                                    disabled: row.isYou,
                                    onSelect: () => setDeleting(row),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {!table.loading && (
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
      )}


      <PlanChangeDialog
        open={downgrade !== null}
        title={`Move ${downgrade?.row.fullName ?? ''} to ${downgrade ? PLAN_LABEL[downgrade.plan] : ''}?`}
        planLabel={downgrade ? PLAN_LABEL[downgrade.plan] : ''}
        impact={downgrade?.impact ?? null}
        loading={downgrade !== null && downgrade.impact === null && !downgradeError}
        pending={downgradePending}
        error={downgradeError}
        onConfirm={confirmDowngrade}
        onCancel={() => setDowngrade(null)}
      />

      <AddUserDialog open={adding} onClose={() => setAdding(false)} onCreated={refetch} />

      <EditUserDialog row={editing} onClose={() => setEditing(null)} onSaved={refetch} />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.fullName ?? ''}?`}
        description={
          <>
            <p>
              This removes <strong>{deleting?.email}</strong> and everything belonging to the account. It cannot be
              undone.
            </p>
            {deleting && deleting.usage.zonesCount + deleting.usage.zonesPaused > 0 && (
              <p className="mt-md">
                Going with it: {deleting.usage.zonesCount + deleting.usage.zonesPaused} zones and{' '}
                {deleting.usage.schedulesActiveCount + deleting.usage.schedulesPaused} capture windows.
              </p>
            )}
          </>
        }
        confirmLabel="Delete account"
        destructive
        pending={deletePending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
