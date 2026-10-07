'use client'

import { Dialog } from '@base-ui/react/dialog'
import { cn } from '@/lib/utils'
import { IconX } from './icons'

/**
 * The ✕ in a modal's top-right corner (FE-31). Every Dialog.Popup carries one, so any
 * modal can be dismissed the same way — Esc and the backdrop still work too. Disable it
 * where Cancel is disabled (mid-save).
 */
export function DialogCloseX({ disabled, className }: { disabled?: boolean; className?: string }) {
  return (
    <Dialog.Close
      aria-label="Close"
      disabled={disabled}
      className={cn(
        'absolute top-lg right-lg w-8 h-8 rounded-sm inline-flex items-center justify-center text-text-muted',
        'hover:text-text-primary hover:bg-canvas-secondary transition-colors',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      <IconX size={18} />
    </Dialog.Close>
  )
}
