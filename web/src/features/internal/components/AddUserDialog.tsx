'use client'

/**
 * Staff creating an account for someone (F-21).
 *
 * Two states, not one screen that tries to be both: the form, and then the handover.
 * That split exists because of a constraint — there is no email delivery, so whatever
 * the new account signs in with has to travel from this screen to a person by hand. A
 * generated password appears exactly once and cannot be read back, so the dialog must
 * stop and make the admin deal with it rather than closing itself and moving on.
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
import type { Plan, PlatformRole } from '@/features/auth/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Handover {
  email: string
  password: string | null
}

export function AddUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [plan, setPlan] = useState<Plan>('free')
  const [role, setRole] = useState<PlatformRole>('user')
  const [setOwnPassword, setSetOwnPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handover, setHandover] = useState<Handover | null>(null)
  const [copied, setCopied] = useState(false)

  const emailError = submitted && !EMAIL_RE.test(email) ? 'Enter a valid email address.' : null
  const nameError = submitted && !fullName.trim() ? 'A name is required.' : null
  const passwordError =
    submitted && setOwnPassword && password.length < 8 ? 'Password must be at least 8 characters.' : null
  const valid = EMAIL_RE.test(email) && fullName.trim() !== '' && (!setOwnPassword || password.length >= 8)

  function reset() {
    setEmail('')
    setFullName('')
    setPlan('free')
    setRole('user')
    setSetOwnPassword(false)
    setPassword('')
    setSubmitted(false)
    setError(null)
    setHandover(null)
    setCopied(false)
  }

  function finish() {
    reset()
    onClose()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!valid) return
    setSaving(true)
    try {
      const created = await internalApi.createUser({
        email: email.trim(),
        fullName: fullName.trim(),
        plan,
        role,
        password: setOwnPassword ? password : undefined,
      })
      // Refresh the directory now: the account exists whether or not the admin lingers
      // on the handover step.
      onCreated()
      setHandover({ email: created.user.email, password: created.temporaryPassword ?? null })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function copyPassword() {
    if (!handover?.password) return
    try {
      await navigator.clipboard.writeText(handover.password)
      setCopied(true)
    } catch {
      // Clipboard access can be refused outright. The password is on screen in
      // selectable text, so this is a missing convenience, not a dead end.
      setCopied(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && finish()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[32rem] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          {handover ? (
            <>
              <Dialog.Title className="text-section-title text-text-primary">Account created</Dialog.Title>
              <Dialog.Description className="text-caption text-text-secondary mt-xs mb-lg">
                {handover.email}
              </Dialog.Description>

              {handover.password ? (
                <>
                  <Alert variant="warning" className="mb-lg">
                    This password is shown once. It&rsquo;s stored hashed, so nobody &mdash; including you &mdash; can
                    read it back. Copy it now and pass it on.
                  </Alert>
                  <div className="flex items-center gap-md">
                    <code className="flex-1 bg-canvas-secondary border border-border rounded-sm px-md py-sm text-body text-text-primary break-all select-all">
                      {handover.password}
                    </code>
                    <Button variant="secondary" onClick={copyPassword}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-body text-text-secondary">
                  They can sign in with the password you set.
                </p>
              )}

              <div className="mt-xl flex justify-end gap-md">
                <Button onClick={finish}>Done</Button>
              </div>
            </>
          ) : (
            <form onSubmit={submit} noValidate>
              <Dialog.Title className="text-section-title text-text-primary">Add a user</Dialog.Title>
              <Dialog.Description className="text-caption text-text-secondary mt-xs mb-lg">
                Creates the account directly. There&rsquo;s no invitation email yet, so you&rsquo;ll hand over the
                password yourself.
              </Dialog.Description>

              {error && (
                <Alert variant="warning" className="mb-lg">
                  {error}
                </Alert>
              )}

              <div className="space-y-lg">
                <div className="space-y-xs">
                  <FormLabel htmlFor="new-name">Full name</FormLabel>
                  <Input id="new-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Siti Aminah" />
                  {nameError && <p className="text-caption text-danger-text">{nameError}</p>}
                </div>

                <div className="space-y-xs">
                  <FormLabel htmlFor="new-email">Work email</FormLabel>
                  <Input
                    id="new-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="siti@binamarga.go.id"
                  />
                  {emailError && <p className="text-caption text-danger-text">{emailError}</p>}
                </div>

                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-lg">
                  <div className="space-y-xs">
                    <FormLabel htmlFor="new-plan">Plan</FormLabel>
                    <Select
                      value={plan}
                      onValueChange={(v) => setPlan(v as Plan)}
                      options={PLAN_ORDER.map((p) => ({ value: p, label: PLAN_LABEL[p] }))}
                      aria-label="Plan for the new account"
                    />
                  </div>
                  <div className="space-y-xs">
                    <FormLabel htmlFor="new-role">Role</FormLabel>
                    <Select
                      value={role}
                      onValueChange={(v) => setRole(v as PlatformRole)}
                      options={[
                        { value: 'user', label: 'User — a customer' },
                        { value: 'internal', label: 'Internal — Maceut staff' },
                      ]}
                      aria-label="Role for the new account"
                    />
                  </div>
                </div>

                {role === 'internal' && (
                  <p className="text-caption text-text-muted">
                    Internal accounts aren&rsquo;t counted as customers and don&rsquo;t appear in revenue figures.
                  </p>
                )}

                <div className="space-y-sm">
                  <label className="flex items-center gap-sm text-body text-text-secondary">
                    <input
                      type="checkbox"
                      checked={setOwnPassword}
                      onChange={(e) => setSetOwnPassword(e.target.checked)}
                      className="shrink-0"
                    />
                    Set the password myself
                  </label>
                  {setOwnPassword ? (
                    <div className="space-y-xs">
                      <Input
                        id="new-password"
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        aria-label="Password for the new account"
                      />
                      {passwordError && <p className="text-caption text-danger-text">{passwordError}</p>}
                    </div>
                  ) : (
                    <p className="text-caption text-text-muted">
                      A strong password will be generated and shown to you once.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-xl flex justify-end gap-md">
                <Button type="button" variant="secondary" onClick={finish} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Creating…' : 'Create account'}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
