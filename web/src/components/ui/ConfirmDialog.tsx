'use client'

import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { DialogCloseX } from './DialogCloseX'
import { Button } from './Button'
import { Input } from './Input'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  pending?: boolean
  /**
   * When set, the confirm button stays disabled until this word is typed exactly. For
   * actions that cannot be undone, where one stray click must not be enough.
   */
  confirmPhrase?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  pending,
  confirmPhrase,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const locked = confirmPhrase !== undefined && typed.trim() !== confirmPhrase
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onCancel()}
      onOpenChangeComplete={(next) => !next && setTyped('')}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[26rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <DialogCloseX />
          <Dialog.Title className="pr-xl text-section-title text-text-primary mb-sm">{title}</Dialog.Title>
          <Dialog.Description className="text-body text-text-secondary mb-lg">{description}</Dialog.Description>
          {confirmPhrase !== undefined && (
            <form
              className="mb-lg"
              onSubmit={(e) => {
                e.preventDefault()
                if (!locked && !pending) onConfirm()
              }}
            >
              <label htmlFor="confirm-phrase" className="block text-body text-text-primary mb-xs">
                Type <strong>{confirmPhrase}</strong> to confirm
              </label>
              <Input
                id="confirm-phrase"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={pending}
              />
            </form>
          )}
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={onCancel} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              onClick={onConfirm}
              disabled={pending || locked}
            >
              {pending ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
