import { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Controls match the 44px button height so rows of mixed controls line up. */
const CONTROL =
  'h-11 w-full px-lg border border-border rounded-sm text-body text-text-primary bg-canvas ' +
  'focus:outline-none focus:border-primary transition-colors'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'placeholder:text-text-muted', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, className)} {...props} />
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn('w-5 h-5 rounded-xs border-border text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-primary', className)}
      {...props}
    />
  )
}

export function FormLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-label text-text-secondary font-medium', className)} {...props} />
}
