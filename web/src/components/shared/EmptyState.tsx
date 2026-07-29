import { ReactNode } from 'react'

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-section text-center space-y-md">
      <p className="text-section-title text-text-primary">{title}</p>
      <p className="text-body text-text-secondary">{description}</p>
      {action}
    </div>
  )
}
