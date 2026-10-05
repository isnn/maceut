'use client'

import Link from 'next/link'
import { Toast } from '@base-ui/react/toast'
import { cn } from '@/lib/utils'
import { IconAlert, IconCheck, IconInfo, IconX } from './icons'

export type ToastTone = 'success' | 'warning' | 'info'

interface ToastData {
  tone: ToastTone
  href?: string
  hrefLabel?: string
}

/**
 * One toast queue for the app (Base UI Toast). Anything can call `showToast`; the
 * `<Toaster />` mounted in the header renders them, bottom-right, five seconds each.
 */
export const toastManager = Toast.createToastManager<ToastData>()

export function showToast(opts: { title: string; description?: string; tone: ToastTone; href?: string; hrefLabel?: string }) {
  toastManager.add({
    title: opts.title,
    description: opts.description,
    timeout: 6000,
    data: { tone: opts.tone, href: opts.href, hrefLabel: opts.hrefLabel },
  })
}

const TONE: Record<ToastTone, { Icon: typeof IconCheck; mark: string }> = {
  success: { Icon: IconCheck, mark: 'bg-success-bg text-success-text' },
  warning: { Icon: IconAlert, mark: 'bg-warning-bg text-warning-text' },
  info: { Icon: IconInfo, mark: 'bg-primary-soft text-primary' },
}

function ToastList() {
  const { toasts } = Toast.useToastManager<ToastData>()
  return toasts.map((toast) => {
    const tone = TONE[toast.data?.tone ?? 'info']
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className={cn(
          'w-[22rem] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-lg p-md flex gap-sm',
          'transition-all data-[starting-style]:opacity-0 data-[starting-style]:translate-y-2 data-[ending-style]:opacity-0',
        )}
      >
        <span aria-hidden className={cn('w-6 h-6 shrink-0 rounded-full flex items-center justify-center', tone.mark)}>
          <tone.Icon size={14} />
        </span>
        <Toast.Content className="min-w-0 flex-1">
          <Toast.Title className="text-label font-semibold text-text-primary" />
          <Toast.Description className="text-caption text-text-secondary mt-xs" />
          {toast.data?.href && (
            <Link
              href={toast.data.href}
              onClick={() => toastManager.close(toast.id)}
              className="inline-block mt-xs text-caption text-primary font-semibold no-underline hover:underline"
            >
              {toast.data.hrefLabel ?? 'Open'}
            </Link>
          )}
        </Toast.Content>
        <Toast.Close aria-label="Dismiss" className="self-start p-xs rounded-xs text-text-muted hover:text-text-primary">
          <IconX size={14} />
        </Toast.Close>
      </Toast.Root>
    )
  })
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-lg right-lg z-50 flex flex-col gap-sm outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
