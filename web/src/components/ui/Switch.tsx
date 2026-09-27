'use client'

import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
  className?: string
}

/**
 * An on/off toggle on Base UI's Switch, for settings that take effect immediately
 * (a layer shown or hidden) — where a checkbox reads like a form waiting for Submit.
 */
export function Switch({ checked, onCheckedChange, disabled, id, className, ...rest }: SwitchProps) {
  return (
    <BaseSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-border transition-colors',
        'data-[checked]:bg-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'data-[disabled]:opacity-40',
        className,
      )}
    >
      <BaseSwitch.Thumb className="block h-5 w-5 translate-x-[2px] rounded-full bg-canvas shadow-elevation-2 transition-transform data-[checked]:translate-x-[18px]" />
    </BaseSwitch.Root>
  )
}
