import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive'
  /** `md` (44px) is the app-wide control height; `sm` (36px) is for inline row actions. */
  size?: 'md' | 'sm'
}

/** Shared with the anchor-styled buttons in `buttonClass` below. */
const BASE =
  'inline-flex items-center justify-center gap-sm font-semibold rounded-md no-underline transition-colors ' +
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const SIZES = {
  md: 'h-11 px-lg text-body',
  sm: 'h-9 px-md text-label',
} as const

const VARIANTS = {
  primary: 'bg-primary hover:bg-primary-hover text-on-primary',
  secondary: 'bg-canvas border border-border text-text-primary hover:bg-canvas-secondary',
  destructive: 'bg-canvas border border-border text-danger-text hover:bg-danger-bg',
} as const

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return <button className={cn(BASE, SIZES[size], VARIANTS[variant], className)} {...props} />
}

/** For `<Link>`s that need to look like buttons — same height and padding. */
export function buttonClass(variant: keyof typeof VARIANTS = 'primary', size: keyof typeof SIZES = 'md') {
  return cn(BASE, SIZES[size], VARIANTS[variant])
}
