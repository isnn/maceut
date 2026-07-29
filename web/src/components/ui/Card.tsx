import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-card border border-border rounded-lg p-xl', className)} {...props} />
}

export function CardSummary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-card border border-border rounded-lg p-xl sticky top-6', className)} {...props} />
}
