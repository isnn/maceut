'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { UsageMeter } from '@/components/ui/UsageMeter'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import { PLAN_LABEL, PLAN_LIMITS, PLAN_ORDER } from '@/lib/constants'
import { ApiError } from '@/types/api'
import * as internalApi from '@/features/internal/api'
import { isInternalByConfig } from '@/features/auth/internal-access'
import type { InternalUserRow } from '@/features/internal/types'
import type { Plan, PlatformRole } from '@/features/auth/types'

const ROLE_LABEL: Record<PlatformRole, string> = { user: 'User', internal: 'Internal' }

export default function InternalUsersPage() {
  const [rows, setRows] = useState<InternalUserRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<Plan | 'all'>('all')
  const [roleFilter, setRoleFilter] = useState<PlatformRole | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<InternalUserRow | null>(null)
  const [downgrade, setDowngrade] = useState<{ row: InternalUserRow; plan: Plan } | null>(null)

  const load = useCallback(() => internalApi.getUserDirectory(), [])
  const refetch = useCallback(() => load().then(setRows), [load])

  useEffect(() => {
    load().then(setRows)
  }, [load])

  const visible = useMemo(() => {
    if (!rows) return []
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesTerm =
        term === '' ||
        row.fullName.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        row.organisation.toLowerCase().includes(term)
      return matchesTerm && (planFilter === 'all' || row.plan === planFilter) && (roleFilter === 'all' || row.role === roleFilter)
    })
  }, [rows, search, planFilter, roleFilter])

  const internalCount = rows?.filter((r) => r.role === 'internal').length ?? 0

  async function changeRole(row: InternalUserRow, role: PlatformRole) {
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
      setDowngrade({ row, plan })
      return
    }
    await internalApi.setUserPlan(row.id, plan)
    refetch()
  }

  async function confirmDowngrade() {
    if (!downgrade) return
    await internalApi.setUserPlan(downgrade.row.id, downgrade.plan)
    setDowngrade(null)
    refetch()
  }

  const overLimits = downgrade
    ? (() => {
        const next = PLAN_LIMITS[downgrade.plan]
        const u = downgrade.row.usage
        const over: string[] = []
        if (u.zonesCount > next.zonesLimit) over.push(`${u.zonesCount} zones over a ${next.zonesLimit}-zone limit`)
        if (u.schedulesActiveCount > next.schedulesLimit)
          over.push(`${u.schedulesActiveCount} active windows over a ${next.schedulesLimit} limit`)
        if (u.storageUsedGb > next.storageGb) over.push(`${u.storageUsedGb} GB over a ${next.storageGb} GB limit`)
        return over
      })()
    : []

  return (
    <div className="space-y-lg">
      <div>
        <p className="text-label text-text-secondary">Platform · {rows?.length ?? 0} accounts</p>
        <h1 className="text-page-title font-bold text-text-primary mt-xs">Users</h1>
        <p className="text-body text-text-secondary mt-xs max-w-[70ch]">
          Change a customer&rsquo;s plan or grant them internal access. You cannot change your own role, and the last
          internal account cannot be demoted.
        </p>
      </div>

      {error && <Alert variant="warning">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-md">
        <Input
          type="search"
          placeholder="Search name, email or organisation…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
            { value: 'internal', label: 'Internal' },
            { value: 'user', label: 'User' },
          ]}
          className="w-44"
          aria-label="Filter by role"
        />
      </div>

      {rows === null ? (
        <div className="h-64 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : visible.length === 0 ? (
        <EmptyState title="No accounts match" description="Try a different filter or search term." />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Organisation</Th>
                <Th>Plan</Th>
                <Th>Role</Th>
                <Th>Usage</Th>
                <Th>Joined</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const byConfig = isInternalByConfig(row.email)
                const isLastInternal = row.role === 'internal' && internalCount <= 1
                const roleLocked = row.isYou || isLastInternal || byConfig
                return (
                  <tr key={row.id} className="hover:bg-canvas-secondary/60 transition-colors">
                    <Td>
                      <div className="flex items-center gap-md">
                        <span className="w-9 h-9 rounded-full bg-primary-soft text-[#5A35F3] text-label font-bold flex items-center justify-center shrink-0">
                          {row.fullName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-text-primary truncate">
                            {row.fullName}
                            {row.isYou && <span className="ml-sm text-micro text-text-muted font-normal">You</span>}
                            {row.isDemo && (
                              <span className="ml-sm text-micro text-text-muted font-normal border border-border rounded-xs px-sm py-[1px]">
                                demo
                              </span>
                            )}
                          </p>
                          <p className="text-caption text-text-muted truncate">{row.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-text-secondary">{row.organisation || '—'}</Td>
                    <Td>
                      <Select
                        size="sm"
                        value={row.plan}
                        onValueChange={(v) => changePlan(row, v as Plan)}
                        options={PLAN_ORDER.map((plan) => ({ value: plan, label: PLAN_LABEL[plan] }))}
                        className="w-36"
                        aria-label={`Plan for ${row.fullName}`}
                      />
                    </Td>
                    <Td>
                      <Select
                        size="sm"
                        value={row.role}
                        disabled={roleLocked}
                        title={
                          byConfig
                            ? 'Granted by NEXT_PUBLIC_INTERNAL_EMAILS — change it there'
                            : row.isYou
                              ? 'You cannot change your own role'
                              : isLastInternal
                                ? 'The last internal account cannot be demoted'
                                : undefined
                        }
                        onValueChange={(v) => changeRole(row, v as PlatformRole)}
                        options={(Object.keys(ROLE_LABEL) as PlatformRole[]).map((role) => ({
                          value: role,
                          label: ROLE_LABEL[role],
                        }))}
                        className="w-32"
                        aria-label={`Role for ${row.fullName}`}
                      />
                      {byConfig && <p className="text-micro text-text-muted mt-xs">set by env</p>}
                    </Td>
                    <Td className="text-caption text-text-secondary whitespace-nowrap tabular-nums">
                      {row.usage.zonesCount}/{row.usage.zonesLimit} zones ·{' '}
                      {row.usage.capturesToday}/{row.usage.capturesLimit} captures
                    </Td>
                    <Td className="text-text-secondary whitespace-nowrap">{formatDate(row.createdAt)}</Td>
                    <Td className="text-right">
                      <button onClick={() => setViewing(row)} className="text-label text-info hover:underline">
                        View usage
                      </button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {viewing && <UsageDialog row={viewing} onClose={() => setViewing(null)} />}

      <ConfirmDialog
        open={downgrade !== null}
        title={`Move ${downgrade?.row.fullName ?? ''} to ${downgrade ? PLAN_LABEL[downgrade.plan] : ''}?`}
        description={
          overLimits.length > 0 ? (
            <>
              This account would be over its new limits:
              <ul className="mt-sm list-disc pl-lg space-y-xs">
                {overLimits.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            'This lowers the account’s limits. Existing zones and captures are kept.'
          )
        }
        confirmLabel="Change plan"
        onConfirm={confirmDowngrade}
        onCancel={() => setDowngrade(null)}
      />
    </div>
  )
}

function UsageDialog({ row, onClose }: { row: InternalUserRow; onClose: () => void }) {
  const limits = PLAN_LIMITS[row.plan]
  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[36rem] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <Dialog.Title className="text-section-title text-text-primary">{row.fullName}</Dialog.Title>
          <Dialog.Description className="text-caption text-text-secondary mt-xs mb-lg">
            {row.email}
            {row.organisation && ` · ${row.organisation}`} · {PLAN_LABEL[row.plan]} plan
          </Dialog.Description>

          {row.isDemo && (
            <Alert variant="warning" className="mb-lg">
              Seeded demo tenant — these figures are fabricated and never change.
            </Alert>
          )}

          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
            <UsageMeter label="Zones" value={row.usage.zonesCount} max={row.usage.zonesLimit} />
            <UsageMeter label="Captures today" value={row.usage.capturesToday} max={row.usage.capturesLimit} />
            <UsageMeter label="Active windows" value={row.usage.schedulesActiveCount} max={row.usage.schedulesLimit} />
            <UsageMeter label="Storage" value={row.usage.storageUsedGb} max={row.usage.storageLimitGb} unit=" GB" />
          </div>

          <dl className="mt-xl border-t border-divider pt-lg divide-y divide-divider">
            <Row label="Capture interval" value={limits.captureInterval} />
            <Row label="History kept" value={limits.historyLabel} />
            <Row label="Animation export" value={limits.exportLabel} />
            <Row label="Joined" value={formatDate(row.createdAt)} />
          </dl>

          <div className="flex justify-end mt-xl">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-md py-md first:pt-0 last:pb-0">
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="text-body font-semibold text-text-primary">{value}</dd>
    </div>
  )
}
