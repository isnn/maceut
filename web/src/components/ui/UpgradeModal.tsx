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
          <Dialog.Title className="text-section-title text-text-primary mb-sm">Upgrade plan diperlukan</Dialog.Title>
          <Dialog.Description className="text-body text-text-secondary mb-lg">
            Road class ini memerlukan plan <span className="font-semibold capitalize">{requiredPlan}</span> atau lebih
            tinggi. Upgrade plan Anda untuk mengakses road class ini.
          </Dialog.Description>
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" className="h-10 px-lg" onClick={onClose}>
              Tutup
            </Button>
            <Link href="/settings/plans">
              <Button variant="primary" className="h-10 px-lg">
                Lihat Plan
              </Button>
            </Link>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
