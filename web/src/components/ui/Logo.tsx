import Link from 'next/link'
import { cn } from '@/lib/utils'

interface LogoProps {
  href?: string
  /** `on-dark` is for the wordmark sitting over photography. */
  tone?: 'default' | 'on-dark'
  className?: string
}

/** The `maceut®` wordmark, set in Bricolage Grotesque. */
export function Logo({ href = '/', tone = 'default', className }: LogoProps) {
  return (
    <Link href={href} className={cn('inline-flex items-baseline gap-[2px] no-underline', className)}>
      <span
        className={cn(
          'font-brand text-[20px] font-extrabold tracking-tight',
          tone === 'on-dark' ? 'text-white' : 'text-text-primary'
        )}
      >
        maceut
      </span>
      <span className={cn('font-brand text-micro', tone === 'on-dark' ? 'text-white/60' : 'text-text-muted')}>®</span>
    </Link>
  )
}
