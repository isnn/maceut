import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ink' | 'tint' | 'secondary' | 'destructive'
  /** `md` (44px) is the app-wide control height; `sm` (36px) is for inline row actions. */
  size?: 'md' | 'sm'
}

/** Shared with the anchor-styled buttons in `buttonClass` below. */
const BASE =
  'inline-flex items-center justify-center gap-sm font-semibold rounded-md no-underline transition-colors ' +
  'focus:outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const SIZES = {
  md: 'h-11 px-lg text-body',
  sm: 'h-9 px-md text-label',
} as const

/**
 * Filled, on-brand: `primary` (purple) for the main action, `ink` (near-black) for the
 * second headline action, `tint` (soft purple) for everyday actions. `secondary` is the
 * quiet outline; `destructive` stays apart on purpose.
 */
const VARIANTS = {
  primary: 'bg-primary hover:bg-primary-hover text-on-primary',
  ink: 'bg-text-primary hover:opacity-90 text-on-primary',
  tint: 'bg-primary-soft hover:bg-primary-soft/60 text-primary',
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

/**
 * A text link in the brand style — section links ("See all", "Open Studio") and inline
 * actions. Purple and semibold, underlined only on hover. It replaces the default blue
 * (`text-info`), which read as a browser link rather than part of the product.
 */
export function linkClass(size: 'body' | 'caption' = 'body') {
  return cn(
    'font-semibold text-primary no-underline hover:underline underline-offset-2 transition-colors',
    size === 'body' ? 'text-body' : 'text-caption',
  )
}
