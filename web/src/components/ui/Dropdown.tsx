'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface DropdownProps {
  /** Rendered inside the trigger button. */
  trigger: React.ReactNode
  triggerClassName?: string
  triggerLabel: string
  align?: 'left' | 'right'
  panelClassName?: string
  children: (close: () => void) => React.ReactNode
}

/**
 * Click-outside menu used by the header (profile + notifications).
 * Hand-rolled rather than pulled from Base UI so the trigger can be any shape
 * and the panel can hold arbitrary content, not just menu items.
 */
export function Dropdown({ trigger, triggerClassName, triggerLabel, align = 'right', panelClassName, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((v) => !v)}
        className={cn('transition-colors focus-visible:outline-2 focus-visible:outline-primary', triggerClassName)}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-[calc(100%+8px)] z-30 bg-card border border-border rounded-lg shadow-elevation-3 overflow-hidden',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName ?? 'w-64'
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
