'use client'

import { Menu } from '@base-ui/react/menu'
import { cn } from '@/lib/utils'
import { IconDotsVertical } from './icons'

export interface ActionItem {
  label: string
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

/**
 * Row-action menu behind a "more" trigger.
 *
 * Built on Base UI's Menu rather than the hand-rolled Dropdown because this
 * lives inside a table's horizontal scroll container — an absolutely positioned
 * panel would be clipped by it. Menu portals the popup out of that subtree.
 */
export function ActionMenu({ label, items }: { label: string; items: ActionItem[] }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={label}
        className="inline-flex items-center justify-center w-9 h-9 rounded-sm text-text-muted hover:bg-canvas-secondary hover:text-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
      >
        <IconDotsVertical size={18} />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50">
          <Menu.Popup className="min-w-[10rem] bg-card border border-border rounded-md shadow-elevation-3 p-xs">
            {items.map((item) => (
              <Menu.Item
                key={item.label}
                disabled={item.disabled}
                onClick={item.onSelect}
                className={(state) =>
                  cn(
                    'block w-full text-left px-md py-sm rounded-sm text-body cursor-pointer select-none outline-none transition-colors',
                    item.destructive ? 'text-danger-text' : 'text-text-secondary',
                    state.highlighted && (item.destructive ? 'bg-danger-bg/60' : 'bg-canvas-secondary text-text-primary'),
                    state.disabled && 'opacity-50 cursor-not-allowed'
                  )
                }
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
