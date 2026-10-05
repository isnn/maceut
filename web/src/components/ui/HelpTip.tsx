'use client'

import { Tooltip } from '@base-ui/react/tooltip'
import { IconInfo } from './icons'

/**
 * A small help icon that explains something on hover (or focus, for keyboards) —
 * for notes a person needs once, which otherwise sit on screen permanently as a
 * paragraph nobody reads the second time. Built on Base UI's Tooltip.
 */
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={150}
        aria-label={label}
        className="inline-grid place-items-center h-6 w-6 rounded-full text-text-muted hover:text-text-primary hover:bg-canvas-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-primary transition-colors"
      >
        <IconInfo size={16} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className="max-w-[18rem] rounded-md bg-text-primary px-md py-sm text-caption text-on-primary shadow-elevation-3">
            {children}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
