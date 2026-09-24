'use client'

/**
 * Staff editing an account (F-22).
 *
 * Sends only the fields that actually changed. That is not an optimisation — the
 * server refuses a role change an admin makes to themselves, so submitting an
 * untouched role would 403 someone who was only fixing a typo in a name.
 *
 * The password field is deliberately separate from the rest and empty by default: a
 * pre-filled password box invites an accidental rotation, and rotating signs the
 * account out everywhere.
 */

import { FormEvent, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { PLAN_LABEL, PLAN_ORDER } from '@/lib/constants'
import { ApiError } from '@/types/api'
import * as internalApi from '@/features/internal/api'
import { isInternalByConfig } from '@/features/auth/internal-access'
import type { InternalUserRow } from '@/features/internal/types'
import type { Plan, PlatformRole } from '@/features/auth/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EditUserDialog({
  row,
  onClose,
  onSaved,
}: {
  row: InternalUserRow | null
  onClose: () => void
  onSaved: () => void
}) {
  if (!row) return null
  // Keyed on the account id: opening a different row remounts the form, so its fields
  // start from that account's values. An effect that reset them on every row change
  // would do the same thing one render later, and briefly show the previous account's
  // details in the process.
  return <EditUserForm key={row.id} row={row} onClose={onClose} onSaved={onSaved} />
}

function EditUserForm({
  row,
  onClose,
  onSaved,
}: {
  row: InternalUserRow
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(row.fullName)
  const [email, setEmail] = useState(row.email)
  const [plan, setPlan] = useState<Plan>(row.plan)
  const [role, setRole] = useState<PlatformRole>(row.role)
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleByConfig = isInternalByConfig(row.email)
  const emailError = submitted && !EMAIL_RE.test(email) ? 'Enter a valid email address.' : null
  const nameError = submitted && !fullName.trim() ? 'A name is required.' : null
  const passwordError = submitted && password !== '' && password.length < 8 ? 'At least 8 characters.' : null
  const valid = EMAIL_RE.test(email) && fullName.trim() !== '' && (password === '' || password.length >= 8)

  // Only what moved. An unchanged role would trip the server's no-self-edit guard.
  const changes: internalApi.UpdateUserInput = {}
  if (fullName.trim() !== row.fullName) changes.fullName = fullName.trim()
  if (email.trim().toLowerCase() !== row.email.toLowerCase()) changes.email = email.trim().toLowerCase()
  if (plan !== row.plan) changes.plan = plan
  if (role !== row.role) changes.role = role
  if (password !== '') changes.password = password
  const nothingChanged = Object.keys(changes).length === 0

  const lowersPlan = PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf(row.plan)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!valid || nothingChanged) return
    setSaving(true)
    try {
      await internalApi.updateUser(row.id, changes)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[34rem] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <form onSubmit={submit} noValidate>
            <Dialog.Title className="text-section-title text-text-primary">Edit account</Dialog.Title>
            <Dialog.Description className="text-caption text-text-secondary mt-xs mb-lg">
              {row.email}
              {row.isYou && ' · this is you'}
            </Dialog.Description>

            {error && (
              <Alert variant="warning" className="mb-lg">
                {error}
              </Alert>
            )}

            <div className="space-y-lg">
              <div className="space-y-xs">
                <FormLabel htmlFor="edit-name">Full name</FormLabel>
                <Input id="edit-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                {nameError && <p className="text-caption text-danger-text">{nameError}</p>}
              </div>

              <div className="space-y-xs">
                <FormLabel htmlFor="edit-email">Email</FormLabel>
                <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                {emailError && <p className="text-caption text-danger-text">{emailError}</p>}
                {roleByConfig && email.trim().toLowerCase() !== row.email.toLowerCase() && (
                  <p className="text-caption text-warning-text">
                    This address is listed in INTERNAL_EMAILS. Changing it removes that account&rsquo;s staff access.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
                <div className="space-y-xs">
                  <FormLabel htmlFor="edit-plan">Plan</FormLabel>
                  <Select
                    value={plan}
                    onValueChange={(v) => setPlan(v as Plan)}
                    options={PLAN_ORDER.map((p) => ({ value: p, label: PLAN_LABEL[p] }))}
                    aria-label="Plan"
                  />
                </div>
                <div className="space-y-xs">
                  <FormLabel htmlFor="edit-role">Role</FormLabel>
                  <Select
                    value={role}
                    onValueChange={(v) => setRole(v as PlatformRole)}
                    disabled={row.isYou || roleByConfig}
                    options={[
                      { value: 'user', label: 'User — a customer' },
                      { value: 'internal', label: 'Internal — Maceut staff' },
                    ]}
                    aria-label="Role"
                  />
                  {row.isYou && <p className="text-caption text-text-muted">You cannot change your own role.</p>}
                  {!row.isYou && roleByConfig && (
                    <p className="text-caption text-text-muted">Set by INTERNAL_EMAILS.</p>
                  )}
                </div>
              </div>

              {lowersPlan && (
                <Alert variant="warning">
                  Moving down a plan pauses anything over the new limits &mdash; zones, capture windows and intervals.
                  Nothing is deleted.
                </Alert>
              )}

              <div className="space-y-xs border-t border-divider pt-lg">
                <FormLabel htmlFor="edit-password">New password</FormLabel>
                <Input
                  id="edit-password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep the current one"
                  autoComplete="new-password"
                />
                {passwordError && <p className="text-caption text-danger-text">{passwordError}</p>}
                <p className="text-caption text-text-muted">
                  Setting a password signs this account out everywhere. There&rsquo;s no email delivery yet, so
                  you&rsquo;ll need to pass it on yourself.
                </p>
              </div>
            </div>

            <div className="mt-xl flex items-center justify-end gap-md">
              {nothingChanged && <span className="text-caption text-text-muted mr-auto">Nothing changed yet.</span>}
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || nothingChanged}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
