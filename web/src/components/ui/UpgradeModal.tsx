'use client'

import { Dialog } from '@base-ui/react/dialog'
import Link from 'next/link'
import { Button } from './Button'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  requiredPlan: string
}

export function UpgradeModal({ open, onClose, requiredPlan }: UpgradeModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[24rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <Dialog.Title className="text-section-title text-text-primary mb-sm">Upgrade required</Dialog.Title>
          <Dialog.Description className="text-body text-text-secondary mb-lg">
            This road class needs the <span className="font-semibold capitalize">{requiredPlan}</span> plan or
            higher. Upgrade to collect it.
          </Dialog.Description>
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Link href="/profile">
              <Button variant="primary">
                See plans
              </Button>
            </Link>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
