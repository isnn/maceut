import Link from 'next/link'
import { cn } from '@/lib/utils'

/** The `maceut®` wordmark used in every header (public, app and onboarding). */
export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-baseline gap-[2px] no-underline', className)}>
      <span className="text-[19px] font-extrabold tracking-tight text-text-primary">maceut</span>
      <span className="text-micro text-text-muted">®</span>
    </Link>
  )
}
