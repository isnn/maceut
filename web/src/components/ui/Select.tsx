'use client'

import { Select as BaseSelect } from '@base-ui/react/select'
import { cn } from '@/lib/utils'
import { IconCheck, IconChevronDown } from './icons'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  /** Leading glyph in the trigger, so the control says what it picks. */
  icon?: React.ReactNode
  placeholder?: string
  disabled?: boolean
  /** `md` matches the 44px control height; `sm` is for table rows. */
  size?: 'md' | 'sm'
  /**
   * Sets the width — there is no default, so every caller states it. A base
   * `w-full` here would silently beat any numeric width passed in: Tailwind
   * emits keyword utilities after numeric ones, and `cn()` is a plain join.
   */
  className?: string
  id?: string
  title?: string
  'aria-label'?: string
  /**
   * Pass `false` when this sits inside a Dialog — Base UI defaults it to true,
   * which stacks a second scroll lock and focus trap on top of the dialog's and
   * makes Escape dismiss both at once.
   */
  modal?: boolean
}

const TRIGGER_SIZE = {
  md: 'h-11 px-lg text-body',
  sm: 'h-9 px-md text-label',
} as const

/**
 * Dropdown built on Base UI's Select so the open list can carry our own styling
 * — a native `<select>` hands both the arrow and the list to the browser, and
 * the list can't be styled at all.
 */
export function Select({
  value,
  onValueChange,
  options,
  icon,
  placeholder = 'Select…',
  disabled,
  size = 'md',
  className,
  id,
  title,
  modal,
  'aria-label': ariaLabel,
}: SelectProps) {
  return (
    <BaseSelect.Root value={value} onValueChange={(next) => onValueChange(next as string)} disabled={disabled} modal={modal}>
      <BaseSelect.Trigger
        id={id}
        title={title}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center justify-between gap-sm rounded-sm border border-border bg-canvas text-text-primary',
          'hover:bg-canvas-secondary data-[popup-open]:border-primary transition-colors',
          'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          TRIGGER_SIZE[size],
          className
        )}
      >
        <span className="flex items-center gap-sm min-w-0">
          {icon && (
            <span aria-hidden className="shrink-0 text-text-muted flex items-center">
              {icon}
            </span>
          )}
          <BaseSelect.Value placeholder={<span className="text-text-muted">{placeholder}</span>} className="truncate text-left" />
        </span>
        <BaseSelect.Icon className="shrink-0 text-text-muted">
          <IconChevronDown size={size === 'sm' ? 14 : 16} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={6}
          align="start"
          // Defaults to true, which overlays the trigger with the selected item
          // macOS-style; we want an ordinary panel below the control.
          alignItemWithTrigger={false}
          className="z-50"
        >
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] max-h-[18rem] overflow-y-auto bg-card border border-border rounded-md shadow-elevation-3 p-xs">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={(state) =>
                    cn(
                      'flex items-center gap-sm px-md py-sm rounded-sm cursor-pointer select-none outline-none',
                      'text-body text-text-secondary transition-colors',
                      state.highlighted && 'bg-canvas-secondary text-text-primary',
                      state.selected && 'text-text-primary font-medium',
                      state.disabled && 'opacity-50 cursor-not-allowed'
                    )
                  }
                >
                  <span className="w-4 shrink-0">
                    <BaseSelect.ItemIndicator>
                      <IconCheck size={14} className="text-primary" />
                    </BaseSelect.ItemIndicator>
                  </span>
                  <BaseSelect.ItemText className="truncate">{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
