/**
 * Capture windows, against the real backend
 * (GET/POST /schedules, PATCH/DELETE /schedules/:id).
 *
 * Plan limits (BR-005), the per-plan interval cap and the daily frame budget (BR-006)
 * are enforced server-side now and surface as `ApiError` with the same codes the
 * Schedule board already branches on. Nothing is seeded — the board shows the windows
 * that exist in the workspace.
 *
 * `framesPerDay` stays client-side so the dialog can show what a window will cost
 * while it is still being drawn, before there is anything to ask the server about.
 * The server computes the same number from the same formula, and its answer is the
 * one that gets enforced.
 */

import { apiClient } from '@/lib/api-client'
import { framesPerDay, type CaptureWindow, type CreateWindowInput } from './types'

/**
 * The server also returns `cron` (derived on read, never stored) and its own
 * `framesPerDay`. Neither is part of `CaptureWindow`; `cron` is there for a future
 * "what will this actually run?" readout, which is what stops a schedule being a
 * black box to the person who made it.
 */
interface ScheduleResponse extends CaptureWindow {
  framesPerDay: number
  cron: string
}

export async function getWindows(): Promise<CaptureWindow[]> {
  return apiClient.get<ScheduleResponse[]>('/schedules')
}

/** Windows attached to one zone — used by the zone detail page. */
export async function getWindowsForZone(zoneId: string): Promise<CaptureWindow[]> {
  return apiClient.get<ScheduleResponse[]>(`/schedules?zoneId=${encodeURIComponent(zoneId)}`)
}

/**
 * No `plan` argument: the server reads it from the workspace, the only copy that can
 * be trusted. Passing it from the client was decorative at best and spoofable at worst.
 */
export async function createWindow(input: CreateWindowInput): Promise<CaptureWindow> {
  return apiClient.post<ScheduleResponse>('/schedules', input)
}

export async function updateWindow(id: string, patch: Partial<CaptureWindow>): Promise<CaptureWindow> {
  // Only the fields the API accepts. `zoneId` is deliberately not among them — a
  // window pointed at a different zone is a different window (F-06), and its captured
  // history would stop matching what it claims to be.
  const body: Record<string, unknown> = {}
  if (patch.label !== undefined) body.label = patch.label
  if (patch.start !== undefined) body.start = patch.start
  if (patch.end !== undefined) body.end = patch.end
  if (patch.interval !== undefined) body.interval = patch.interval
  if (patch.days !== undefined) body.days = patch.days
  if (patch.active !== undefined) body.active = patch.active

  return apiClient.patch<ScheduleResponse>(`/schedules/${id}`, body)
}

export async function deleteWindow(id: string): Promise<void> {
  await apiClient.delete<{ deleted: boolean }>(`/schedules/${id}`)
}

/** Total frames per day across active windows — the Schedule budget readout. */
export function totalFramesPerDay(windows: CaptureWindow[]): number {
  return windows.filter((w) => w.active).reduce((sum, w) => sum + framesPerDay(w), 0)
}
