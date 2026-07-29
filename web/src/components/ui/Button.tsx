import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive'
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const base = 'h-12 px-xl font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-primary hover:bg-primary-hover text-on-primary',
    secondary: 'bg-canvas border border-border text-text-primary hover:bg-canvas-secondary',
    destructive: 'bg-canvas border border-border text-red-600 hover:bg-red-50',
  }
  return <button className={cn(base, variants[variant], className)} {...props} />
}
