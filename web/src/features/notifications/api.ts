/**
 * The bell (NOTIF), against the real API. Notifications are written by the server where
 * things happen — a capture worker, the scheduler, an export, a plan change — so this
 * only reads them and marks them read.
 */
import { apiClient } from '@/lib/api-client'

export type NotificationTone = 'warning' | 'success' | 'info'

export type NotificationType =
  | 'capture_failing'
  | 'capture_recovered'
  | 'captures_missed'
  | 'capture_limit_reached'
  | 'capture_limit_near'
  | 'export_ready'
  | 'export_failed'
  | 'plan_changed'
  | 'here_budget_warning'
  | 'here_budget_reached'

export interface AppNotification {
  id: string
  type: NotificationType
  tone: NotificationTone
  title: string
  body: string
  actionLabel: string | null
  actionHref: string | null
  zoneName: string | null
  read: boolean
  createdAt: string
}

export interface NotificationFeed {
  items: AppNotification[]
  unreadCount: number
}

export async function getNotifications(limit = 20): Promise<NotificationFeed> {
  return apiClient.get<NotificationFeed>(`/notifications?limit=${limit}`)
}

export async function markRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`)
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/notifications/read-all')
}

export interface NotificationPreferences {
  /** Email me if scheduled captures keep failing (at most one a day, after 2 hours). */
  emailCaptureProblems: boolean
}

export async function getPreferences(): Promise<NotificationPreferences> {
  return apiClient.get<NotificationPreferences>('/me/notification-preferences')
}

export async function updatePreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
  return apiClient.patch<NotificationPreferences>('/me/notification-preferences', prefs)
}
