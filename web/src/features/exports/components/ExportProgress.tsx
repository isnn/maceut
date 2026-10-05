'use client'

/**
 * How an export's state reads, everywhere it's shown — the Studio export dialog, the
 * chip in Studio's footer, and each row of the zone page's Exports history. One set of
 * words for each state, so the three places can never describe the same export
 * differently.
 */

import { useEffect, useState } from 'react'
import { cn, formatFileSize } from '@/lib/utils'
import { getExport, getZoneExports, isActive, type ExportJob, type ExportStatus } from '../api'

/** How often an active export is re-read. The worker writes progress about once a second. */
export const EXPORT_POLL_MS = 2000

function eta(seconds: number): string {
  if (seconds < 60) return `about ${Math.max(seconds, 1)} s left`
  const m = Math.round(seconds / 60)
  return `about ${m} min left`
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso))
}

/** The pill's text and colour for a state. */
export function pillFor(job: ExportJob): { label: string; tone: 'neutral' | 'progress' | 'success' | 'danger' | 'muted' } {
  switch (job.status) {
    case 'queued':
      return { label: 'Queued', tone: 'neutral' }
    case 'rendering':
      return { label: `Rendering ${job.framesDone} / ${job.frameCount}`, tone: 'progress' }
    case 'uploading':
      return { label: 'Saving', tone: 'progress' }
    case 'done':
      return { label: 'Ready', tone: 'success' }
    case 'failed':
      return { label: 'Failed', tone: 'danger' }
    case 'expired':
      return { label: 'Expired', tone: 'muted' }
  }
}

/** The line under the pill: what is happening, in words. */
export function detailFor(job: ExportJob): string {
  switch (job.status) {
    case 'queued':
      return job.queuePosition
        ? `Waiting — ${job.queuePosition} export${job.queuePosition === 1 ? '' : 's'} ahead of yours`
        : 'Starting…'
    case 'rendering':
      return job.etaSeconds !== null ? eta(job.etaSeconds) : 'Drawing the first frame…'
    case 'uploading':
      return job.fileSize ? `Uploading ${formatFileSize(job.fileSize)}` : 'Saving the file…'
    case 'done':
      return `${job.fileSize ? formatFileSize(job.fileSize) : 'Ready'}${job.expiresAt ? ` · kept until ${shortDate(job.expiresAt)}` : ''}`
    case 'failed':
      return job.error ?? 'Something went wrong while rendering.'
    case 'expired':
      return 'Deleted after its retention period.'
  }
}

const TONE: Record<ReturnType<typeof pillFor>['tone'], string> = {
  neutral: 'bg-canvas-secondary text-text-secondary',
  progress: 'bg-primary-soft text-primary',
  success: 'bg-success-bg text-success-text',
  danger: 'bg-danger-bg text-danger-text',
  muted: 'bg-canvas-secondary text-text-muted',
}

export function ExportPill({ job }: { job: ExportJob }) {
  const pill = pillFor(job)
  return (
    <span className={cn('inline-flex items-center gap-xs text-micro font-semibold rounded-xs px-sm py-xs tabular-nums whitespace-nowrap', TONE[pill.tone])}>
      {isActive(job) && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {pill.label}
    </span>
  )
}

/** A thin bar: the rendered share of frames; indeterminate (pulsing) while queued or saving. */
export function ExportBar({ job, className }: { job: ExportJob; className?: string }) {
  if (!isActive(job)) return null
  const indeterminate = job.status !== 'rendering'
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={job.frameCount}
      aria-valuenow={job.framesDone}
      className={cn('h-1.5 rounded-full bg-canvas-secondary overflow-hidden', className)}
    >
      <div
        className={cn('h-full rounded-full bg-primary transition-all duration-500', indeterminate && 'animate-pulse')}
        style={{ width: indeterminate ? '100%' : `${Math.max(job.progress * 100, 3)}%`, opacity: indeterminate ? 0.35 : 1 }}
      />
    </div>
  )
}

export const FORMAT_LABEL: Record<ExportJob['format'], string> = { zip: 'Frames · ZIP', webm: 'Animation · WebM' }

/** True while the page is visible — polling pauses in a background tab. */
function useVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

/**
 * One export, kept fresh: re-read every 2 s while it's queued, rendering or saving and
 * the tab is visible; left alone once it's done, failed or expired.
 */
export function useExport(id: string | null, initial?: ExportJob | null) {
  const [job, setJob] = useState<{ id: string; data: ExportJob } | null>(initial ? { id: initial.id, data: initial } : null)
  const visible = useVisible()
  const current = job && job.id === id ? job.data : null
  const active = current ? isActive(current) : id !== null

  useEffect(() => {
    if (!id || !visible || !active) return
    let cancelled = false
    const read = () =>
      getExport(id)
        .then((data) => {
          if (!cancelled) setJob({ id, data })
        })
        .catch(() => undefined)
    void read()
    const timer = setInterval(read, EXPORT_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [id, visible, active])

  return current
}

/** A zone's exports; polled while any of them is still in progress. */
export function useZoneExports(zoneId: string, refreshKey = 0) {
  const [state, setState] = useState<{ key: string; rows: ExportJob[] } | null>(null)
  const visible = useVisible()
  const key = `${zoneId}:${refreshKey}`
  const rows = state?.key === key ? state.rows : null
  const anyActive = rows?.some(isActive) ?? true

  useEffect(() => {
    if (!visible || !anyActive) return
    let cancelled = false
    const read = () =>
      getZoneExports(zoneId)
        .then((next) => {
          if (!cancelled) setState({ key, rows: next })
        })
        .catch(() => {
          if (!cancelled) setState({ key, rows: [] })
        })
    void read()
    const timer = setInterval(read, EXPORT_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [zoneId, key, visible, anyActive])

  return rows
}

export type { ExportStatus }
