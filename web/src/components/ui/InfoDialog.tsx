'use client'

import { Dialog } from '@base-ui/react/dialog'
import { DialogCloseX } from './DialogCloseX'
import { Button } from './Button'

/** A notice that needs acknowledging, with one button. ConfirmDialog's frame, without the choice. */
export function InfoDialog({
  open,
  title,
  description,
  buttonLabel = 'OK',
  onClose,
}: {
  open: boolean
  title: string
  description: React.ReactNode
  buttonLabel?: string
  onClose: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[26rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <DialogCloseX />
          <Dialog.Title className="pr-xl text-section-title text-text-primary mb-sm">{title}</Dialog.Title>
          <Dialog.Description render={<div />} className="text-body text-text-secondary mb-lg">
            {description}
          </Dialog.Description>
          <div className="flex justify-end">
            <Button onClick={onClose}>{buttonLabel}</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
