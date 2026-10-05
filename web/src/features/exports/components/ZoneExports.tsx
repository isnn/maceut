'use client'

/**
 * The zone page's Exports history (FE-21) — the last section on the page.
 *
 * Every ZIP and animation made from this zone in Studio, newest first, with its live
 * state: queued, rendering (with frames done and time left), saving, ready to
 * download, failed (with the reason, and Retry), expired. The list re-reads itself
 * every 2 s while anything in it is still in progress, and stops once nothing is.
 *
 * Arriving from Studio's "Open zone page" link (`?export=<id>#exports`) scrolls here and
 * highlights that export's row.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, buttonClass } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { cn, formatWibShort } from '@/lib/utils'
import { IconDownload, IconFilm } from '@/components/ui/icons'
import { isActive, removeExport, retryExport, exportErrorMessage, type ExportJob } from '../api'
import { ExportBar, ExportPill, FORMAT_LABEL, detailFor, useZoneExports } from './ExportProgress'

const when = formatWibShort

function range(job: ExportJob): string {
  return `${when(job.range.from)} → ${when(job.range.to)}`
}

export function ZoneExports({ zoneId }: { zoneId: string }) {
  const [refresh, setRefresh] = useState(0)
  const rows = useZoneExports(zoneId, refresh)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const highlight = useSearchParams().get('export')

  // Arriving from Studio's link: bring the section into view once its rows exist.
  useEffect(() => {
    if (!highlight || !rows) return
    document.getElementById('exports')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [highlight, rows])

  async function act(job: ExportJob, action: 'retry' | 'remove') {
    setBusy(job.id)
    setError(null)
    try {
      if (action === 'retry') await retryExport(job.id)
      else await removeExport(job.id)
      setRefresh((n) => n + 1)
    } catch (err) {
      setError(exportErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section id="exports" className="space-y-md scroll-mt-xl">
      <SectionHeader
        icon={<IconFilm size={18} />}
        title="Exports"
        description="ZIPs and animations made from this zone in Studio. Files are kept for 7 days."
      />

      {error && <Alert variant="warning">{error}</Alert>}

      {rows === null ? (
        <div className="h-24 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-canvas px-xl py-xl text-center">
          <p className="text-body text-text-secondary">No exports yet.</p>
          <p className="text-caption text-text-muted mt-xs">
            In Studio, choose Export → All frames or Animation. It renders here while you do something else.
          </p>
        </div>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Requested at (WIB)</Th>
                <Th>File</Th>
                <Th>Time range (WIB)</Th>
                <Th className="w-[34%]">Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => (
                <tr
                  key={job.id}
                  className={cn('align-top transition-colors', job.id === highlight ? 'bg-primary-soft/40' : 'hover:bg-canvas-secondary/60')}
                >
                  <Td className="tabular-nums whitespace-nowrap">{when(job.createdAt)}</Td>
                  <Td className="whitespace-nowrap">
                    <span className="block text-body font-semibold text-text-primary">{FORMAT_LABEL[job.format]}</span>
                    <span className="block text-caption text-text-muted tabular-nums">
                      {job.frameCount} frames · {job.width} × {job.height}
                    </span>
                  </Td>
                  <Td className="tabular-nums whitespace-nowrap text-text-secondary">{range(job)}</Td>
                  <Td>
                    <div className="space-y-xs min-w-[12rem]">
                      <ExportPill job={job} />
                      <ExportBar job={job} />
                      <p className={cn('text-caption', job.status === 'failed' ? 'text-danger-text' : 'text-text-muted')}>
                        {detailFor(job)}
                      </p>
                    </div>
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-sm">
                      {job.status === 'done' && job.downloadUrl && (
                        <a href={job.downloadUrl} className={buttonClass('primary', 'sm')} download>
                          <IconDownload size={14} />
                          Download
                        </a>
                      )}
                      {(job.status === 'failed' || job.status === 'expired') && (
                        <Button variant="tint" size="sm" onClick={() => act(job, 'retry')} disabled={busy !== null}>
                          {busy === job.id ? 'Retrying…' : 'Retry'}
                        </Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => act(job, 'remove')} disabled={busy !== null}>
                        {isActive(job) ? 'Cancel' : 'Delete'}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  )
}
