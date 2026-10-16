'use client'

/**
 * Staff editing an account (F-22).
 *
 * Sends only the fields that actually changed. That is not an optimisation — the
 * server refuses a role change an admin makes to themselves, so submitting an
 * untouched role would 403 someone who was only fixing a typo in a name.
 *
 * Four sections, in the order staff reach for them: who the person is, what they can
 * do (account type first, then the plan or staff type that depends on it), whether
 * their address is verified, and a password reset kept apart and empty by default —
 * a pre-filled password box invites an accidental rotation, and rotating signs the
 * account out everywhere.
 */

import { FormEvent, ReactNode, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { DialogCloseX } from '@/components/ui/DialogCloseX'
import { Button } from '@/components/ui/Button'
import { Checkbox, FormLabel, Input, PasswordInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { AccountPlanPill } from '@/components/ui/Badge'
import { PLAN_LABEL, PLAN_ORDER } from '@/lib/constants'
import { ApiError } from '@/types/api'
import * as internalApi from '@/features/internal/api'
import type { InternalUserRow } from '@/features/internal/types'
import type { Access, Plan } from '@/features/auth/types'
import { VerifiedPill } from './VerifiedPill'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 16 characters without look-alikes (0/O, 1/l/I), so it can be read out loud. */
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

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
  const [role, setRole] = useState<Access>(row.access)
  const [emailVerified, setEmailVerified] = useState(row.emailVerified)
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleByConfig = row.roleLockedByConfig
  const accessLocked = row.isYou || roleByConfig
  const emailError = submitted && !EMAIL_RE.test(email) ? 'Enter a valid email address.' : null
  const nameError = submitted && !fullName.trim() ? 'A name is required.' : null
  const passwordError = submitted && password !== '' && password.length < 8 ? 'At least 8 characters.' : null
  const valid = EMAIL_RE.test(email) && fullName.trim() !== '' && (password === '' || password.length >= 8)

  // Only what moved. An unchanged role would trip the server's no-self-edit guard.
  const changes: internalApi.UpdateUserInput = {}
  if (fullName.trim() !== row.fullName) changes.fullName = fullName.trim()
  if (email.trim().toLowerCase() !== row.email.toLowerCase()) changes.email = email.trim().toLowerCase()
  if (plan !== row.plan) changes.plan = plan
  if (role !== row.access) changes.role = role
  if (emailVerified !== row.emailVerified) changes.emailVerified = emailVerified
  if (password !== '') changes.password = password
  const changeCount = Object.keys(changes).length

  const isStaff = role !== 'user'
  const lowersPlan = !isStaff && PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf(row.plan)
  const emailChanged = changes.email !== undefined

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!valid || changeCount === 0) return
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
    <Dialog.Root open onOpenChange={(next) => !next && !saving && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[36rem] max-h-[90vh] flex flex-col bg-card border border-border rounded-lg shadow-elevation-3">
          <DialogCloseX disabled={saving} />
          <form onSubmit={submit} noValidate className="flex flex-col min-h-0">
            <header className="px-xl pt-xl pb-lg border-b border-divider">
              <Dialog.Title className="pr-xl text-section-title text-text-primary">Edit account</Dialog.Title>
              <Dialog.Description render={<div />} className="mt-md flex flex-wrap items-center gap-md min-w-0">
                <span className="w-10 h-10 rounded-full bg-primary-soft text-primary text-label font-bold flex items-center justify-center shrink-0">
                  {row.fullName.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-text-primary truncate">{row.fullName}</span>
                  <span className="block text-caption text-text-muted truncate">{row.email}</span>
                </span>
                <span className="flex items-center gap-sm shrink-0">
                  <AccountPlanPill access={row.access} plan={row.plan} />
                  <VerifiedPill verified={row.emailVerified} />
                </span>
              </Dialog.Description>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto px-xl py-lg space-y-xl">
              {error && <Alert variant="warning">{error}</Alert>}

              <Section title="Profile">
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
                  <Field id="edit-name" label="Full name" error={nameError}>
                    <Input id="edit-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
                  </Field>
                  <Field id="edit-email" label="Email" error={emailError}>
                    <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                  </Field>
                </div>
                {roleByConfig && emailChanged && (
                  <Alert variant="warning">
                    This address is in INTERNAL_EMAILS. Changing it removes the account&rsquo;s staff access.
                  </Alert>
                )}
              </Section>

              <Section title="Access">
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
                  <Field id="edit-role" label="Account type">
                    <Select
                      value={isStaff ? 'internal' : 'user'}
                      // Customer → staff starts as Admin, the lesser staff type.
                      onValueChange={(v) => setRole(v === 'internal' ? (row.access === 'user' ? 'admin' : row.access) : 'user')}
                      disabled={accessLocked}
                      options={[
                        { value: 'user', label: 'Customer' },
                        { value: 'internal', label: 'Staff' },
                      ]}
                      aria-label="Account type"
                    />
                  </Field>
                  {/* Staff have no customer plan; their access is their staff type (FE-34). */}
                  {isStaff ? (
                    <Field id="edit-staff-type" label="Staff type">
                      <Select
                        value={role}
                        onValueChange={(v) => setRole(v as Access)}
                        disabled={accessLocked}
                        options={[
                          { value: 'admin', label: 'Admin' },
                          { value: 'superadmin', label: 'Superadmin' },
                        ]}
                        aria-label="Staff type"
                      />
                    </Field>
                  ) : (
                    <Field id="edit-plan" label="Plan">
                      <Select
                        value={plan}
                        onValueChange={(v) => setPlan(v as Plan)}
                        options={PLAN_ORDER.map((p) => ({ value: p, label: PLAN_LABEL[p] }))}
                        aria-label="Plan"
                      />
                    </Field>
                  )}
                </div>
                <p className="text-caption text-text-muted">
                  {row.isYou
                    ? 'You can’t change your own access.'
                    : roleByConfig
                      ? 'Superadmin through INTERNAL_EMAILS, so access is set by the server.'
                      : isStaff
                        ? role === 'admin'
                          ? 'Admins see Overview and Users, and can change plans.'
                          : 'Superadmins can do everything, including config, the HERE budget and staff access.'
                        : 'Customers get the limits of their plan.'}
                </p>
                {lowersPlan && <Alert variant="warning">Moving down a plan pauses anything over the new limits.</Alert>}
              </Section>

              <Section title="Email verification">
                <label htmlFor="edit-verified" className="flex items-start gap-md cursor-pointer">
                  <Checkbox
                    id="edit-verified"
                    checked={emailVerified}
                    onChange={(e) => setEmailVerified(e.target.checked)}
                    className="mt-[2px] shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-body font-semibold text-text-primary">Email address verified</span>
                    <span className="block text-caption text-text-muted mt-xs">
                      Unverified accounts can&rsquo;t sign in with their password. Check this when the code email never
                      arrived and you&rsquo;ve confirmed the address another way.
                    </span>
                  </span>
                </label>
              </Section>

              <Section title="Password">
                <Field id="edit-password" label="New password" error={passwordError}>
                  <div className="flex items-start gap-sm">
                    <div className="flex-1 min-w-0">
                      <PasswordInput
                        id="edit-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Leave blank to keep the current one"
                        autoComplete="new-password"
                      />
                    </div>
                    <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
                      Generate
                    </Button>
                  </div>
                </Field>
                <p className="text-caption text-text-muted">
                  Setting a password signs this account out everywhere. Pass it on to them yourself.
                </p>
              </Section>
            </div>

            <footer className="px-xl py-lg border-t border-divider flex flex-wrap items-center justify-end gap-md">
              <span className="text-caption text-text-muted mr-auto">
                {changeCount === 0 ? 'Nothing changed yet.' : `${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`}
              </span>
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || changeCount === 0}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-md">
      <h3 className="text-label font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="space-y-xs min-w-0">
      <FormLabel htmlFor={id}>{label}</FormLabel>
      {children}
      {error && <p className="text-caption text-danger-text">{error}</p>}
    </div>
  )
}
