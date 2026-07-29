import { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full px-lg border border-border rounded-sm text-body text-text-primary bg-canvas placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft transition-colors',
        className
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-11 w-full px-lg border border-border rounded-sm text-body text-text-primary bg-canvas focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft transition-colors',
        className
      )}
      {...props}
    />
  )
}

export function FormLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-label text-text-secondary font-medium', className)} {...props} />
}
