// TODO: replace with real fetch through @/lib/api-client once api/ exists.
// Feeds the header bell dropdown (3i).

export type NotificationTone = 'warning' | 'success' | 'info'

export interface AppNotification {
  id: string
  tone: NotificationTone
  title: string
  body: string
  time: string
  read: boolean
  /** Optional inline action rendered as a link inside the row. */
  actionLabel?: string
  actionHref?: string
}

const READ_KEY = 'maceut_mock_notifications_read'
const MOCK_LATENCY_MS = 250

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

function readReadIds(): string[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(READ_KEY)
  return raw ? (JSON.parse(raw) as string[]) : []
}

const FEED: Omit<AppNotification, 'read'>[] = [
  {
    id: 'zone-paused',
    tone: 'warning',
    title: 'Satu zona sedang dijeda',
    body: 'Tol Cawang–Grogol berhenti mengumpulkan pada 3 Sep.',
    time: 'Kemarin',
    actionLabel: 'Lanjutkan zona',
    actionHref: '/zones',
  },
  {
    id: 'render-done',
    tone: 'success',
    title: 'Animasi selesai di-render',
    body: 'Koridor Sudirman · 5 Sep selesai di-render.',
    time: '2 jam lalu',
    actionLabel: 'Buka Studio',
    actionHref: '/studio',
  },
  {
    id: 'member-joined',
    tone: 'info',
    title: 'Anggota baru bergabung',
    body: 'Dewi Anggraini bergabung ke workspace sebagai Editor.',
    time: 'Kemarin',
    actionLabel: 'Lihat tim',
    actionHref: '/team',
  },
]

export async function getNotifications(): Promise<AppNotification[]> {
  const readIds = readReadIds()
  return delay(FEED.map((n) => ({ ...n, read: readIds.includes(n.id) })))
}

export async function markAllRead(): Promise<void> {
  window.localStorage.setItem(READ_KEY, JSON.stringify(FEED.map((n) => n.id)))
  await delay(null)
}
