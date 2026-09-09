import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AlertProps {
  variant: 'success' | 'warning' | 'info'
  children: ReactNode
  className?: string
}

export function Alert({ variant, children, className }: AlertProps) {
  const styles = {
    success: 'bg-success-bg text-success-text',
    warning: 'bg-warning-bg text-warning-text',
    info: 'bg-info-bg text-info',
  }
  return (
    <div className={cn('rounded-md p-lg flex items-start gap-sm text-body', styles[variant], className)}>
      {children}
    </div>
  )
}
