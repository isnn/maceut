'use client'

import { OTPField } from '@base-ui/react/otp-field'
import { cn } from '@/lib/utils'

interface OtpInputProps {
  id?: string
  length?: number
  value: string
  onChange: (value: string) => void
  /** Fires once every slot is filled — pasting a whole code submits it. */
  onComplete?: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  'aria-describedby'?: string
}

/**
 * A one-time code, one box per digit (Base UI OTP Field).
 *
 * Base UI handles what makes these fields tolerable: pasting the whole code into any
 * box, the phone keyboard's "from Messages / Mail" suggestion (`one-time-code`),
 * digits-only input, and backspace moving to the previous box.
 */
export function OtpInput({ id, length = 6, value, onChange, onComplete, disabled, invalid, ...aria }: OtpInputProps) {
  return (
    <OTPField.Root
      id={id}
      length={length}
      value={value}
      onValueChange={(v) => onChange(v)}
      onValueComplete={(v) => onComplete?.(v)}
      disabled={disabled}
      className="flex gap-sm"
      aria-describedby={aria['aria-describedby']}
    >
      {Array.from({ length }, (_, i) => (
        <OTPField.Input
          key={i}
          aria-invalid={invalid || undefined}
          className={cn(
            'h-12 w-11 min-w-0 flex-1 max-w-12 text-center text-heading-sm font-semibold tabular-nums',
            'border border-border rounded-sm bg-canvas text-text-primary transition-colors',
            'focus:outline-none focus:border-primary disabled:opacity-60',
            invalid && 'border-danger-text',
          )}
        />
      ))}
    </OTPField.Root>
  )
}
