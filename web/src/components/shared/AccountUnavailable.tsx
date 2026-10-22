'use client'

import { Button } from '@/components/ui/Button'
import { EmptyState } from './EmptyState'

/** The signed-in shell when /me couldn't be read — instead of a blank page or a bounce to login. */
export function AccountUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-xl">
      <div className="w-full max-w-md">
        <EmptyState
          title="Couldn’t load your account"
          description={message}
          action={<Button onClick={onRetry}>Try again</Button>}
        />
      </div>
    </div>
  )
}
