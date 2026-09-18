import Link from 'next/link'
import { cn } from '@/lib/utils'

/** The `maceut®` wordmark, set in Bricolage Grotesque. */
export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-baseline gap-[2px] no-underline', className)}>
      <span className="font-brand text-[20px] font-extrabold tracking-tight text-text-primary">maceut</span>
      <span className="font-brand text-micro text-text-muted">®</span>
    </Link>
  )
}
