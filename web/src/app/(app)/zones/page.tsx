'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { Button, buttonClass } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { RoadClassBadge, ZoneStatusPill } from '@/components/ui/Badge'
import { Pagination, SortableTh, Table, TableWrap, Td, Th, type SortDirection } from '@/components/ui/Table'
import { useTableControls } from '@/components/ui/useTableControls'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn, formatDate } from '@/lib/utils'
import { PLAN_LABEL, PLAN_LIMITS, ROAD_CLASS_LABEL } from '@/lib/constants'
import * as zonesApi from '@/features/zones/api'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import { ROAD_CLASS_ORDER } from '@/features/zones/components/RoadClassPicker'
import type { RoadClass, Zone } from '@/features/zones/types'

type Filter = 'all' | 'collecting' | 'paused'
type SortKey = 'name' | 'area' | 'roads' | 'cadence' | 'status' | 'created'

/** Text sorts read best ascending; quantities read best largest-first. */
const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  name: 'asc',
  area: 'desc',
  roads: 'desc',
  cadence: 'asc',
  status: 'asc',
  created: 'desc',
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'collecting', label: 'Collecting' },
  { id: 'paused', label: 'Paused' },
]

export default function ZonesPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const [roadClassFilter, setRoadClassFilter] = useState<RoadClass | 'all'>('all')
  const [pendingDelete, setPendingDelete] = useState<Zone | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [limitOpen, setLimitOpen] = useState(false)

  const plan = user?.plan ?? 'free'
  const zonesLimit = PLAN_LIMITS[plan].zonesLimit

  // No dependency: the server scopes the list to the session, so a plan change
  // does not change which zones come back.
  const load = useCallback(() => zonesApi.getZones(), [])
  const refetch = useCallback(() => load().then(setZones), [load])

  useEffect(() => {
    if (user) load().then(setZones)
  }, [user, load])

  // Status and road class narrow the set before search, sort and paging, so the count
  // under the table reads within the filter rather than across every zone.
  const filtered = useMemo(
    () =>
      zones?.filter(
        (zone) =>
          (filter === 'all' || zone.status === filter) &&
          (roadClassFilter === 'all' || zone.roadClass === roadClassFilter),
      ) ?? null,
    [zones, filter, roadClassFilter],
  )

  const table = useTableControls<Zone>({
    rows: filtered,
    searchOn: (zone) => [zone.name],
    sortOn: {
      name: (zone) => zone.name.toLowerCase(),
      area: (zone) => zone.areaKm2,
      // Null rather than 0: a zone whose roads HERE has not reported is not a zone
      // with no roads, and the hook sorts unknowns last either way.
      roads: (zone) => zone.roadsCount,
      cadence: (zone) => zone.cadence,
      status: (zone) => zone.status,
      created: (zone) => zone.createdAt,
    },
    defaultDirection: DEFAULT_DIRECTION,
    // Newest first before anyone touches a header.
    initialSort: { key: 'created', direction: 'desc' },
  })

  const visible = table.visible
  const sort = table.sort
  const toggleSort = (key: SortKey) => table.toggleSort(key)

  const atLimit = (zones?.length ?? 0) >= zonesLimit

  async function toggleStatus(zone: Zone) {
    await zonesApi.setZoneStatus(zone.id, zone.status === 'collecting' ? 'paused' : 'collecting')
    refetch()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    await zonesApi.deleteZone(pendingDelete.id)
    setDeleting(false)
    setPendingDelete(null)
    refetch()
  }

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <h1 className="text-page-title font-bold text-text-primary">Your zones</h1>
        {atLimit ? (
          <Button onClick={() => setLimitOpen(true)}>New zone</Button>
        ) : (
          <Link
            href="/zones/new"
            className={buttonClass()}
          >
            New zone
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-md">
        <div className="flex bg-canvas-secondary border border-border rounded-md p-[3px]">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                'px-md h-9 rounded-sm text-label transition-colors',
                filter === item.id ? 'bg-canvas text-text-primary font-semibold shadow-elevation-2' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          placeholder="Search zones…"
          value={table.search}
          onChange={(e) => table.setSearch(e.target.value)}
          className="h-11 w-full tablet:w-56"
        />
        <Select
          value={roadClassFilter}
          onValueChange={(v) => setRoadClassFilter(v as RoadClass | 'all')}
          options={[
            { value: 'all', label: 'All road classes' },
            ...ROAD_CLASS_ORDER.map((rc) => ({ value: rc, label: ROAD_CLASS_LABEL[rc] })),
          ]}
          className="w-52"
          aria-label="Filter by road class"
        />
      </div>

      {zones === null ? (
        <div className="h-64 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={zones.length === 0 ? 'No zones yet' : 'No zones match'}
          description={
            zones.length === 0
              ? 'Draw your first boundary to start collecting traffic conditions.'
              : 'Try a different filter or search term.'
          }
          action={
            zones.length === 0 ? (
              <Link
                href="/zones/new"
                className={buttonClass()}
              >
                Create your first zone
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortableTh active={sort?.key === 'name'} direction={sort?.direction ?? 'asc'} onSort={() => toggleSort('name')}>
                    Zone
                  </SortableTh>
                  <Th>Road classes</Th>
                  <SortableTh
                    className="text-right"
                    active={sort?.key === 'area'}
                    direction={sort?.direction ?? 'desc'}
                    onSort={() => toggleSort('area')}
                  >
                    Area
                  </SortableTh>
                  <SortableTh
                    className="text-right"
                    active={sort?.key === 'roads'}
                    direction={sort?.direction ?? 'desc'}
                    onSort={() => toggleSort('roads')}
                  >
                    Roads
                  </SortableTh>
                  <SortableTh active={sort?.key === 'cadence'} direction={sort?.direction ?? 'asc'} onSort={() => toggleSort('cadence')}>
                    Capture
                  </SortableTh>
                  <SortableTh active={sort?.key === 'status'} direction={sort?.direction ?? 'asc'} onSort={() => toggleSort('status')}>
                    Status
                  </SortableTh>
                  <SortableTh active={sort?.key === 'created'} direction={sort?.direction ?? 'desc'} onSort={() => toggleSort('created')}>
                    Created
                  </SortableTh>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((zone) => (
                  <tr key={zone.id} className="hover:bg-canvas-secondary/60 transition-colors">
                    <Td>
                      <Link
                        href={`/zones/${zone.id}`}
                        className="font-semibold text-text-primary no-underline hover:text-primary transition-colors"
                      >
                        {zone.name}
                      </Link>
                    </Td>
                    <Td>
                      <RoadClassBadge roadClass={zone.roadClass} />
                    </Td>
                    <Td className="text-right tabular-nums">{zone.areaKm2} km²</Td>
                    <Td className="text-right tabular-nums">{zone.roadsCount ?? '—'}</Td>
                    <Td className="text-text-secondary">{zone.cadence}</Td>
                    <Td>
                      <ZoneStatusPill status={zone.status} />
                    </Td>
                    <Td className="text-text-secondary whitespace-nowrap">{formatDate(zone.createdAt)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="flex justify-end">
                        <ActionMenu
                          label={`Actions for ${zone.name}`}
                          items={[
                            { label: 'View details', onSelect: () => router.push(`/zones/${zone.id}`) },
                            { label: 'Edit zone', onSelect: () => router.push(`/zones/${zone.id}?edit=1`) },
                            {
                              label: zone.status === 'collecting' ? 'Pause collecting' : 'Resume collecting',
                              onSelect: () => toggleStatus(zone),
                            },
                            { label: 'Delete zone', destructive: true, onSelect: () => setPendingDelete(zone) },
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
            noun="zones"
            onClearSearch={table.search ? () => table.setSearch('') : undefined}
          />
          <p className="text-caption text-text-muted">
            Deleting a zone keeps its captures and animations for 30 days, then removes them.
          </p>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete “${pendingDelete?.name ?? ''}”?`}
        description="Captures and animations for this zone are kept for 30 days, then removed. Its capture windows stop too."
        confirmLabel="Delete zone"
        destructive
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ZoneLimitDialog open={limitOpen} onClose={() => setLimitOpen(false)} used={zones?.length ?? 0} limit={zonesLimit} planLabel={PLAN_LABEL[plan]} />
    </div>
  )
}

/** 3e — the paywall shown when every zone slot on the plan is in use. */
function ZoneLimitDialog({
  open,
  onClose,
  used,
  limit,
  planLabel,
}: {
  open: boolean
  onClose: () => void
  used: number
  limit: number
  planLabel: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[28rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <span className="w-10 h-10 rounded-full bg-warning-bg text-warning-text flex items-center justify-center text-heading-sm font-bold mb-md">
            !
          </span>
          <Dialog.Title className="text-section-title text-text-primary mb-sm">Zone limit reached</Dialog.Title>
          <Dialog.Description className="text-body text-text-secondary mb-lg">
            The {planLabel} plan includes <span className="font-semibold text-text-primary">{limit} zones</span> and all
            of them are in use. Upgrade to Premium for 25 zones, or free a slot by deleting one you no longer collect.
          </Dialog.Description>
          <dl className="border border-border rounded-md divide-y divide-divider mb-lg">
            <div className="flex justify-between px-lg py-md">
              <dt className="text-body text-text-secondary">Zones in use</dt>
              <dd className="text-body font-semibold text-text-primary tabular-nums">
                {used} / {limit}
              </dd>
            </div>
            <div className="flex justify-between px-lg py-md">
              <dt className="text-body text-text-secondary">Premium allows</dt>
              <dd className="text-body font-semibold text-text-primary">25 zones · 15-minute capture</dd>
            </div>
          </dl>
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={onClose}>
              Manage zones
            </Button>
            <Link href="/profile">
              <Button>Upgrade plan</Button>
            </Link>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
