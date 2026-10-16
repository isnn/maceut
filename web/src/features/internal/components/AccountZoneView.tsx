'use client'

/**
 * One customer zone, read-only, for staff: where it is, what it collects, its capture
 * windows and its latest captures. The same reads the owner gets (the server scopes them
 * to the account), without any of the owner's controls: staff look here to answer a
 * support question, not to change the customer's setup.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { RoadClassBadge, StatusPill } from '@/components/ui/Badge'
import { Pagination, Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { IconArrowLeft } from '@/components/ui/icons'
import { MapCanvas } from '@/features/zones/components/MapCanvas'
import { CAPTURE_STATUS_LABEL, CAPTURE_STATUS_TONE, CAPTURE_TRIGGER_LABEL } from '@/features/zones/capture-labels'
import { DAY_LABEL } from '@/features/schedules/types'
import { formatDate, formatNumber, formatWibShort } from '@/lib/utils'
import { ApiError } from '@/types/api'
import * as internalApi from '../api'

const EVERY = { '15min': 'Every 15 min', hourly: 'Hourly', daily: 'Daily' } as const
const PAGE_SIZE = 10

export function AccountZoneView({ userId, zoneId }: { userId: string; zoneId: string }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<internalApi.AccountZoneDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    internalApi
      .getAccountZone(userId, zoneId, page, PAGE_SIZE)
      .then((next) => {
        setData(next)
        setError(null)
      })
      .catch((err) =>
        setError(
          err instanceof ApiError && (err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN')
            ? 'notfound'
            : 'Couldn’t load this zone.',
        ),
      )
  }, [userId, zoneId, page])

  const back = (
    <Link
      href={`/internal/users/${encodeURIComponent(userId)}`}
      className="inline-flex items-center gap-sm text-body text-text-secondary no-underline hover:text-text-primary transition-colors"
    >
      <IconArrowLeft size={16} />
      Back to account
    </Link>
  )

  if (error === 'notfound') {
    return (
      <div className="space-y-lg">
        {back}
        <EmptyState title="Zone not found" description="It may have been deleted, or it belongs to another account." />
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
        <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />
      </div>
    )
  }

  const { zone, windows, captures } = data

  return (
    <div className="space-y-xl">
      {back}

      <div className="flex flex-wrap items-start gap-md">
        <div className="min-w-0">
          <p className="text-label text-text-secondary">Zone</p>
          <h1 className="text-page-title font-bold text-text-primary mt-xs truncate">{zone.name}</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-sm">
          <RoadClassBadge roadClass={zone.roadClass} />
          <StatusPill tone={zone.status === 'collecting' ? 'success' : zone.pausedByPlan ? 'warning' : 'neutral'}>
            {zone.status === 'collecting' ? 'Collecting' : zone.pausedByPlan ? 'Paused by plan' : 'Paused'}
          </StatusPill>
        </div>
      </div>

      <div className="grid grid-cols-1 laptop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-lg">
        <Card className="overflow-hidden">
          <div className="h-[360px]">
            <MapCanvas polygon={zone.geometry} />
          </div>
        </Card>
        <Card className="p-lg">
          <dl className="grid grid-cols-2 laptop:grid-cols-1 gap-lg">
            <Fact label="Area" value={`${formatNumber(zone.areaKm2, 1)} km²`} />
            <Fact label="Roads matched" value={zone.roadsCount === null ? '—' : formatNumber(zone.roadsCount)} />
            <Fact label="Road length" value={zone.lengthKm === null ? '—' : `${formatNumber(zone.lengthKm, 1)} km`} />
            <Fact label="Created" value={formatDate(zone.createdAt)} />
          </dl>
        </Card>
      </div>

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">Capture windows</h2>
        {windows.length === 0 ? (
          <EmptyState title="No capture windows" description="Nothing is scheduled on this zone." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Window</Th>
                  <Th>Hours (WIB)</Th>
                  <Th>Days</Th>
                  <Th>Interval</Th>
                  <Th className="text-right">Captured</Th>
                  <Th>Next run</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.id}>
                    <Td className="font-semibold text-text-primary">{w.label}</Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {w.start}–{w.end}
                    </Td>
                    <Td className="text-text-secondary whitespace-nowrap">
                      {w.days.length === 7 ? 'Every day' : w.days.map((d) => DAY_LABEL[d]).join(' ')}
                    </Td>
                    <Td className="text-text-secondary">{EVERY[w.interval]}</Td>
                    <Td className="text-right tabular-nums text-text-secondary">{formatNumber(w.capturedFrames)}</Td>
                    <Td className="text-text-secondary whitespace-nowrap tabular-nums">
                      {w.nextFireAt ? formatWibShort(w.nextFireAt) : <span className="text-text-muted">&mdash;</span>}
                    </Td>
                    <Td>
                      <StatusPill tone={w.active ? 'success' : w.pausedByPlan ? 'warning' : 'neutral'}>
                        {w.active ? 'Active' : w.pausedByPlan ? 'Paused by plan' : 'Paused'}
                      </StatusPill>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">Captures</h2>
        {captures.total === 0 ? (
          <EmptyState title="No captures yet" description="This zone hasn’t collected traffic." />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Time (WIB)</Th>
                    <Th>Trigger</Th>
                    <Th className="text-right">Roads</Th>
                    <Th className="text-right">Avg. jam</Th>
                    <Th>Status</Th>
                    <Th>Error</Th>
                  </tr>
                </thead>
                <tbody>
                  {captures.captures.map((c) => (
                    <tr key={c.id}>
                      <Td className="tabular-nums whitespace-nowrap">{formatWibShort(c.capturedAt)}</Td>
                      <Td className="text-text-secondary">{CAPTURE_TRIGGER_LABEL[c.trigger]}</Td>
                      <Td className="text-right tabular-nums text-text-secondary">
                        {c.roadsCount === null ? <span className="text-text-muted">&mdash;</span> : formatNumber(c.roadsCount)}
                      </Td>
                      <Td className="text-right tabular-nums text-text-secondary">
                        {c.jamFactorAvg === null ? <span className="text-text-muted">&mdash;</span> : formatNumber(c.jamFactorAvg, 1)}
                      </Td>
                      <Td>
                        <StatusPill tone={CAPTURE_STATUS_TONE[c.status]}>{CAPTURE_STATUS_LABEL[c.status]}</StatusPill>
                      </Td>
                      <Td className="text-caption text-text-secondary max-w-[20rem] truncate" title={c.error ?? undefined}>
                        {c.error ?? <span className="text-text-muted">&mdash;</span>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination
              page={captures.page}
              pageCount={captures.totalPages}
              pageSize={PAGE_SIZE}
              onPage={setPage}
              matchCount={captures.total}
              totalCount={captures.total}
              noun="captures"
            />
          </>
        )}
      </section>
    </div>
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
