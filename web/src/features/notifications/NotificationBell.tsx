'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dropdown } from '@/components/ui/Dropdown'
import { Toaster, showToast } from '@/components/ui/Toaster'
import { IconAlert, IconBell, IconCheck, IconCheckCheck, IconInfo } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import * as notificationsApi from './api'
import type { AppNotification, NotificationFeed, NotificationType } from './api'

/**
 * The bell (NOTIF), shared by the customer and staff headers.
 *
 * - Refreshes every 60 s while the tab is visible, and at once when you come back to
 *   it — the same polling precedent as exports; the app has no push transport.
 * - Something that finishes while you're here (an export, a zone recovering) also pops
 *   a toast, so you don't have to open the bell to find out.
 * - The unread count rides in the tab title, "(2) …", so it shows from another tab.
 * - Failures of several zones at once read as one row: "3 zones stopped collecting".
 */

const POLL_MS = 60_000
/** Types worth interrupting for with a toast when they arrive while you're in the app. */
const TOAST_TYPES = new Set<NotificationType>(['export_ready', 'export_failed', 'capture_recovered'])
/** Types that collapse into one row when several arrive together. */
const GROUPABLE = new Set<NotificationType>(['capture_failing', 'capture_recovered'])
const GROUP_WINDOW_MS = 30 * 60 * 1000

const TONE_MARK: Record<AppNotification['tone'], { Icon: typeof IconAlert; className: string }> = {
  warning: { Icon: IconAlert, className: 'bg-warning-bg text-warning-text' },
  success: { Icon: IconCheck, className: 'bg-success-bg text-success-text' },
  // Brand, not the default blue: an "info" notification is Maceut telling you something.
  info: { Icon: IconInfo, className: 'bg-primary-soft text-primary' },
}

interface Row {
  key: string
  items: AppNotification[]
  title: string
  body: string
  href: string | null
  actionLabel: string | null
}

/** "3 zones stopped collecting" instead of three rows, for events that arrive together. */
function toRows(items: AppNotification[]): Row[] {
  const rows: Row[] = []
  for (const n of items) {
    const last = rows[rows.length - 1]
    const head = last?.items[0]
    if (
      head &&
      GROUPABLE.has(n.type) &&
      head.type === n.type &&
      head.read === n.read &&
      Math.abs(Date.parse(head.createdAt) - Date.parse(n.createdAt)) <= GROUP_WINDOW_MS
    ) {
      last.items.push(n)
      continue
    }
    rows.push({ key: n.id, items: [n], title: n.title, body: n.body, href: n.actionHref, actionLabel: n.actionLabel })
  }
  for (const row of rows) {
    if (row.items.length < 2) continue
    const names = row.items.map((n) => n.zoneName ?? 'a zone')
    const listed = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
    const failing = row.items[0]!.type === 'capture_failing'
    row.title = failing ? `${row.items.length} zones stopped collecting` : `${row.items.length} zones are collecting again`
    row.body = failing ? `${listed}. We’re retrying — no action needed.` : listed
    row.href = '/zones'
    row.actionLabel = 'Open zones'
  }
  return rows
}

function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso))
}

/** Keeps "(n) " in front of whatever title the current page sets. */
function useTitleBadge(unread: number) {
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\)\s/, '')
      const next = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base
      if (document.title !== next) document.title = next
    }
    apply()
    // Pages set their own title on navigation; re-apply the badge when they do.
    const titleEl = document.querySelector('title')
    const observer = titleEl ? new MutationObserver(apply) : null
    if (titleEl) observer!.observe(titleEl, { childList: true })
    return () => {
      observer?.disconnect()
      document.title = document.title.replace(/^\(\d+\+?\)\s/, '')
    }
  }, [unread])
}

export function NotificationBell() {
  const router = useRouter()
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unreadCount: 0 })
  const [now, setNow] = useState(() => Date.now())
  // Ids already shown or already known — only genuinely new arrivals toast.
  const seen = useRef<Set<string> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await notificationsApi.getNotifications()
      if (seen.current) {
        for (const n of next.items) {
          if (!seen.current.has(n.id) && !n.read && TOAST_TYPES.has(n.type)) {
            showToast({
              title: n.title,
              description: n.body,
              tone: n.tone,
              href: n.actionHref ?? undefined,
              hrefLabel: n.actionLabel ?? undefined,
            })
          }
        }
      }
      seen.current = new Set(next.items.map((n) => n.id))
      setFeed(next)
      setNow(Date.now())
    } catch {
      // Signed out, or the API is briefly unreachable: keep what's shown, try next tick.
    }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      void refresh()
      timer = setInterval(() => void refresh(), POLL_MS)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop())
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  useTitleBadge(feed.unreadCount)

  const rows = useMemo(() => toRows(feed.items), [feed.items])

  /**
   * Marks notifications read: instantly on screen, then on the server. Anything the
   * server refused goes back to unread with a toast — it used to stay "read" here while
   * still unread on the server, and reappear on the next refresh as if the click had
   * been ignored. A refresh afterwards makes the badge match the server exactly.
   */
  async function markRead(ids: string[]) {
    if (!ids.length) return
    const setRead = (which: string[], read: boolean) =>
      setFeed((f) => {
        const items = f.items.map((n) => (which.includes(n.id) ? { ...n, read } : n))
        return { items, unreadCount: items.filter((n) => !n.read).length }
      })
    setRead(ids, true)
    const results = await Promise.allSettled(ids.map((id) => notificationsApi.markRead(id)))
    const failed = ids.filter((_, i) => results[i]!.status === 'rejected')
    if (failed.length) {
      setRead(failed, false)
      showToast({ tone: 'warning', title: 'Couldn’t mark as read', description: 'Check your connection and try again.' })
    }
    await refresh()
  }

  async function open(row: Row, close: () => void) {
    close()
    void markRead(row.items.filter((n) => !n.read).map((n) => n.id))
    if (row.href) router.push(row.href)
  }

  /** The check button on each unread row: mark read without leaving the page. */
  function markRowRead(row: Row) {
    void markRead(row.items.filter((n) => !n.read).map((n) => n.id))
  }

  async function markAllRead() {
    const before = feed
    setFeed((f) => ({ items: f.items.map((n) => ({ ...n, read: true })), unreadCount: 0 }))
    try {
      await notificationsApi.markAllRead()
    } catch {
      setFeed(before)
      showToast({ tone: 'warning', title: 'Couldn’t mark all as read', description: 'Check your connection and try again.' })
    }
    await refresh()
  }

  const unread = feed.unreadCount

  return (
    <>
      <Dropdown
        triggerLabel={`Notifications${unread ? `, ${unread} unread` : ''}`}
        triggerClassName="relative w-10 h-10 rounded-md border border-border bg-canvas hover:bg-canvas-secondary flex items-center justify-center"
        panelClassName="w-[24rem] max-w-[calc(100vw-2rem)]"
        trigger={
          <>
            <IconBell size={18} className="text-text-secondary" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-primary text-on-primary text-micro font-semibold flex items-center justify-center tabular-nums">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </>
        }
      >
        {(close) => (
          <div>
            <div className="flex items-center justify-between px-lg py-md border-b border-divider">
              <span className="text-label font-semibold text-text-primary">Notifications</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-caption font-semibold text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <div className="px-lg py-xl text-center">
                <p className="text-label font-semibold text-text-primary">You&rsquo;re all caught up</p>
                <p className="text-caption text-text-muted mt-xs">
                  Capture problems, finished exports and plan changes show up here.
                </p>
              </div>
            ) : (
              <ul className="max-h-[26rem] overflow-y-auto">
                {rows.map((row) => {
                  const head = row.items[0]!
                  const isUnread = row.items.some((n) => !n.read)
                  const { Icon, className } = TONE_MARK[head.tone]
                  return (
                    <li
                      key={row.key}
                      className={cn(
                        'relative border-b border-divider last:border-b-0 transition-colors hover:bg-canvas-secondary',
                        isUnread && 'bg-primary-soft/25',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void open(row, close)}
                        className="w-full text-left pl-lg pr-[56px] py-md flex gap-sm"
                      >
                        <span aria-hidden className={cn('w-6 h-6 shrink-0 rounded-full flex items-center justify-center', className)}>
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-label font-semibold text-text-primary">{row.title}</span>
                          <span className="block text-caption text-text-secondary mt-xs">{row.body}</span>
                          <span className="flex items-center gap-md mt-xs">
                            <span className="text-micro text-text-muted">{timeAgo(head.createdAt, now)}</span>
                            {row.href && row.actionLabel && <span className="text-micro font-semibold text-primary">{row.actionLabel}</span>}
                          </span>
                        </span>
                      </button>
                      {/* A sibling, not nested: a button can't sit inside the row's button. It sits
                          on the meta line (time · action), where an action belongs, rather than
                          beside the title. Read rows carry nothing — the lighter background says it. */}
                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => markRowRead(row)}
                          aria-label={`Mark “${row.title}” as read`}
                          title="Mark as read"
                          className="absolute bottom-sm right-md w-8 h-8 rounded-md flex items-center justify-center text-primary bg-primary-soft/60 hover:bg-primary hover:text-on-primary transition-colors focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <IconCheckCheck size={16} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </Dropdown>
      <Toaster />
    </>
  )
}
