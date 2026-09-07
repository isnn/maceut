'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RoadClassBadge, ZoneStatusPill } from '@/components/ui/Badge'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn, formatDate } from '@/lib/utils'
import { PLAN_LABEL, PLAN_LIMITS } from '@/lib/constants'
import * as zonesApi from '@/features/zones/api'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import type { Zone } from '@/features/zones/types'

type Filter = 'all' | 'collecting' | 'paused'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'collecting', label: 'Mengumpulkan' },
  { id: 'paused', label: 'Dijeda' },
]

export default function ZonesPage() {
  const { user } = useCurrentUser()
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Zone | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [limitOpen, setLimitOpen] = useState(false)

  const plan = user?.plan ?? 'free'
  const zonesLimit = PLAN_LIMITS[plan].zonesLimit

  const load = useCallback(() => zonesApi.getZones(plan), [plan])
  const refetch = useCallback(() => load().then(setZones), [load])

  useEffect(() => {
    if (user) load().then(setZones)
  }, [user, load])

  const visible = useMemo(() => {
    if (!zones) return []
    return zones.filter((zone) => {
      const matchesFilter = filter === 'all' || zone.status === filter
      const matchesSearch = zone.name.toLowerCase().includes(search.trim().toLowerCase())
      return matchesFilter && matchesSearch
    })
  }, [zones, filter, search])

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
        <div>
          <p className="text-label text-text-secondary">
            Manajemen zona · {zones?.length ?? 0} dari {zonesLimit} zona
          </p>
          <h1 className="text-page-title font-bold text-text-primary mt-xs">Zona Anda</h1>
        </div>
        {atLimit ? (
          <Button className="h-11 px-lg" onClick={() => setLimitOpen(true)}>
            Zona baru
          </Button>
        ) : (
          <Link
            href="/zones/new"
            className="h-11 px-lg inline-flex items-center bg-primary hover:bg-primary-hover text-on-primary font-semibold rounded-md no-underline transition-colors"
          >
            Zona baru
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
          placeholder="Cari zona…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full tablet:w-64"
        />
      </div>

      {zones === null ? (
        <div className="h-64 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={zones.length === 0 ? 'Belum ada zona' : 'Tidak ada zona yang cocok'}
          description={
            zones.length === 0
              ? 'Gambar batas area pertama Anda untuk mulai mengumpulkan kondisi lalu lintas.'
              : 'Ubah filter atau kata kunci pencarian Anda.'
          }
          action={
            zones.length === 0 ? (
              <Link
                href="/zones/new"
                className="h-11 px-lg inline-flex items-center bg-primary hover:bg-primary-hover text-on-primary font-semibold rounded-md no-underline"
              >
                Buat zona pertama
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
                  <Th>Zona</Th>
                  <Th>Kelas jalan</Th>
                  <Th className="text-right">Ruas</Th>
                  <Th className="text-right">Panjang</Th>
                  <Th>Capture</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((zone) => (
                  <tr key={zone.id} className="hover:bg-canvas-secondary/60 transition-colors">
                    <Td>
                      <p className="font-semibold text-text-primary">{zone.name}</p>
                      <p className="text-caption text-text-muted mt-xs">Dibuat {formatDate(zone.createdAt)}</p>
                    </Td>
                    <Td>
                      <RoadClassBadge roadClass={zone.roadClass} />
                    </Td>
                    <Td className="text-right tabular-nums">{zone.roadsCount}</Td>
                    <Td className="text-right tabular-nums">{zone.lengthKm} km</Td>
                    <Td className="text-text-secondary">{zone.cadence}</Td>
                    <Td>
                      <ZoneStatusPill status={zone.status} />
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link href="/schedule" className="text-label text-info no-underline hover:underline">
                        Ubah
                      </Link>
                      <button
                        onClick={() => toggleStatus(zone)}
                        className="ml-md text-label text-text-secondary hover:text-text-primary transition-colors"
                      >
                        {zone.status === 'collecting' ? 'Jeda' : 'Lanjutkan'}
                      </button>
                      <button
                        onClick={() => setPendingDelete(zone)}
                        className="ml-md text-label text-danger-text hover:underline"
                      >
                        Hapus
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <div className="flex items-center justify-between text-caption text-text-muted">
            <span>
              Menampilkan {visible.length} dari {zones.length} zona
            </span>
            <span>
              Menghapus zona menyimpan capture dan animasinya selama 30 hari, lalu dihapus permanen.
            </span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Hapus “${pendingDelete?.name ?? ''}”?`}
        description="Capture dan animasi untuk zona ini disimpan 30 hari, lalu dihapus. Jendela capture-nya ikut berhenti."
        confirmLabel="Hapus zona"
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
          <Dialog.Title className="text-section-title text-text-primary mb-sm">Batas zona tercapai</Dialog.Title>
          <Dialog.Description className="text-body text-text-secondary mb-lg">
            Paket {planLabel} mencakup <span className="font-semibold text-text-primary">{limit} zona</span> dan semuanya
            sedang dipakai. Naik ke Premium untuk 25 zona, atau kosongkan satu slot dengan menghapus zona yang tidak lagi
            dikumpulkan.
          </Dialog.Description>
          <dl className="border border-border rounded-md divide-y divide-divider mb-lg">
            <div className="flex justify-between px-lg py-md">
              <dt className="text-body text-text-secondary">Zona terpakai</dt>
              <dd className="text-body font-semibold text-text-primary tabular-nums">
                {used} / {limit}
              </dd>
            </div>
            <div className="flex justify-between px-lg py-md">
              <dt className="text-body text-text-secondary">Premium memberi</dt>
              <dd className="text-body font-semibold text-text-primary">25 zona · capture 15 menit</dd>
            </div>
          </dl>
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" className="h-10 px-lg" onClick={onClose}>
              Kelola zona
            </Button>
            <Link href="/profile">
              <Button className="h-10 px-lg">Naikkan paket</Button>
            </Link>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
