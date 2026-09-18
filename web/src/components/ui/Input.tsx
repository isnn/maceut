'use client'

import { InputHTMLAttributes, LabelHTMLAttributes, useState } from 'react'
import { cn } from '@/lib/utils'
import { IconEye, IconEyeOff } from './icons'

/** Controls match the 44px button height so rows of mixed controls line up. */
const CONTROL =
  'h-11 w-full px-lg border border-border rounded-sm text-body text-text-primary bg-canvas ' +
  'focus:outline-none focus:border-primary transition-colors'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'placeholder:text-text-muted', className)} {...props} />
}

/**
 * Password field with a reveal toggle. The button stays in the tab order —
 * showing what you typed is the point, and a control you can't reach by
 * keyboard doesn't serve the people who most need it.
 */
export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-12', className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-md top-1/2 -translate-y-1/2 p-xs rounded-xs text-text-muted hover:text-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-primary transition-colors"
      >
        {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </div>
  )
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
