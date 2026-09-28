/**
 * Studio exports rendered on the server (FE-21): POST /zones/:id/exports,
 * GET /zones/:id/exports, GET/DELETE /exports/:id.
 *
 * Only ZIP and animation go through here. A single PNG is still rendered in the tab —
 * it's one frame, done in a second, and a round trip through the queue would only make
 * it slower.
 */

import { apiClient } from '@/lib/api-client'
import { ApiError } from '@/types/api'
import type { RenderOverlay, RenderView } from '@/features/studio/render'

export type ExportFormat = 'zip' | 'webm'
export type ExportStatus = 'queued' | 'rendering' | 'uploading' | 'done' | 'failed' | 'expired'

export interface ExportSpec {
  themeId: string
  congestionId: string
  overlay: RenderOverlay
  view: RenderView
  width: number
  height: number
  holdMs: number
}

export interface ExportJob {
  id: string
  zoneId: string
  format: ExportFormat
  status: ExportStatus
  frameCount: number
  framesDone: number
  /** 0–1. */
  progress: number
  width: number
  height: number
  range: { from: string; to: string }
  fileSize: number | null
  error: string | null
  queuePosition: number | null
  etaSeconds: number | null
  downloadUrl: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  expiresAt: string | null
}

export interface CreateExportInput {
  format: ExportFormat
  startCaptureId: string
  endCaptureId: string
  spec: ExportSpec
}

export const ACTIVE_STATUSES: ExportStatus[] = ['queued', 'rendering', 'uploading']
export const isActive = (job: Pick<ExportJob, 'status'>) => ACTIVE_STATUSES.includes(job.status)

export function createExport(zoneId: string, input: CreateExportInput): Promise<ExportJob> {
  return apiClient.post<ExportJob>(`/zones/${zoneId}/exports`, input)
}

export function getZoneExports(zoneId: string): Promise<ExportJob[]> {
  return apiClient.get<ExportJob[]>(`/zones/${zoneId}/exports`)
}

export function getExport(id: string): Promise<ExportJob> {
  return apiClient.get<ExportJob>(`/exports/${id}`)
}

export function removeExport(id: string): Promise<{ cancelled: boolean }> {
  return apiClient.delete<{ cancelled: boolean }>(`/exports/${id}`)
}

/**
 * The server's refusals, in the app's language. The API answers in Indonesian (its
 * convention); these are the ones a person can act on.
 */
export function exportErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Could not start the export. Please try again.'
  switch (err.code) {
    case 'EXPORT_IN_PROGRESS':
      return 'Another export is still being made. Wait for it to finish, or cancel it on its zone page.'
    case 'EXPORT_LIMIT_EXCEEDED': {
      const limit = err.details?.limit
      const requested = err.details?.requested
      return `Your plan exports up to ${limit} frames at a time — this range has ${requested}. Narrow the time range and try again.`
    }
    case 'UPSTREAM_ERROR':
      return 'The export service is unavailable right now. Please try again in a moment.'
    default:
      return err.message
  }
}

/** Re-queue a finished, failed or expired export as a new one — same settings, same frames. */
export function retryExport(id: string): Promise<ExportJob> {
  return apiClient.post<ExportJob>(`/exports/${id}/retry`)
}
