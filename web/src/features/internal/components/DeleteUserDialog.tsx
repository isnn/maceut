'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ApiError } from '@/types/api'
import * as internalApi from '@/features/internal/api'

export interface DeleteTarget {
  id: string
  fullName: string
  email: string
  zones: number
  windows: number
}

/**
 * Deleting an account, superadmin only (FE-46): the typed "delete" confirmation, the
 * call, and its error kept inside the dialog. Shared by the Users list and the user page.
 */
export function DeleteUserDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget | null
  onClose: () => void
  onDeleted: (email: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!target) return
    setPending(true)
    setError(null)
    try {
      const res = await internalApi.deleteUser(target.id)
      onDeleted(res.deleted.email)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the account. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open={target !== null}
      title={`Delete ${target?.fullName ?? ''}?`}
      description={
        <>
          <p>
            This permanently removes <strong>{target?.email}</strong> and everything belonging to the account: zones,
            capture windows, captures, exports and notifications. It cannot be undone or restored.
          </p>
          {target && target.zones > 0 && (
            <p className="mt-md">
              Going with it: {target.zones} zones and {target.windows} capture windows.
            </p>
          )}
        </>
      }
      confirmLabel="Delete account"
      confirmPhrase="delete"
      destructive
      pending={pending}
      error={error}
      onConfirm={confirm}
      onCancel={() => {
        setError(null)
        onClose()
      }}
    />
  )
}
