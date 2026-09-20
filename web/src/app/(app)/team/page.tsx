'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/Button'
import { FormLabel, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { can } from '@/features/auth/capabilities'
import { Alert } from '@/components/ui/Alert'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import { IconCheck } from '@/components/ui/icons'
import { PLAN_LABEL, PLAN_LIMITS } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as teamApi from '@/features/team/api'
import { ROLE_CAPABILITIES, ROLE_LABEL, type Member, type MemberRole } from '@/features/team/api'

export default function TeamPage() {
  const { user } = useCurrentUser()
  const [members, setMembers] = useState<Member[] | null>(null)
  // Only an Owner may invite or change roles. Hiding these is not the guard —
  // /team/invite and /team/:id/role enforce it — but a button that always 403s
  // is a worse experience than no button.
  const canManage = can(user?.memberRole, 'manage')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null)

  const plan = user?.plan ?? 'free'
  const seatsLimit = PLAN_LIMITS[plan].seatsLimit

  const load = useCallback(
    () => (user ? teamApi.getMembers() : Promise.resolve(null)),
    [user]
  )
  const refetch = useCallback(() => load().then(setMembers), [load])

  useEffect(() => {
    load().then(setMembers)
  }, [load])

  async function changeRole(member: Member, role: MemberRole) {
    await teamApi.updateMemberRole(member.id, role)
    refetch()
  }

  async function confirmRemove() {
    if (!pendingRemove) return
    await teamApi.removeMember(pendingRemove.id)
    setPendingRemove(null)
    refetch()
  }

  const seatsUsed = members?.length ?? 0

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <p className="text-label text-text-secondary">
            {seatsUsed} of {seatsLimit} seats used · {PLAN_LABEL[plan]} plan
          </p>
          <h1 className="text-page-title font-bold text-text-primary mt-xs">Members</h1>
          <p className="text-body text-text-secondary mt-xs max-w-[64ch]">
            Owner and Editor can change zones and schedules. Viewer can watch and download.
          </p>
        </div>
        {canManage && <Button onClick={() => setInviteOpen(true)}>Invite member</Button>}
      </div>

      {members === null ? (
        <div className="h-64 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>Zones</Th>
                <Th>Last seen</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-canvas-secondary/60 transition-colors">
                  <Td>
                    <div className="flex items-center gap-md">
                      <span className="w-9 h-9 rounded-full bg-primary-soft text-[#5A35F3] text-label font-bold flex items-center justify-center shrink-0">
                        {member.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-text-primary truncate">
                          {member.name}
                          {member.isYou && <span className="ml-sm text-micro text-text-muted font-normal">You</span>}
                        </p>
                        <p className="text-caption text-text-muted truncate">{member.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {member.isYou ? (
                      <span className="text-body text-text-primary">{ROLE_LABEL[member.role]}</span>
                    ) : (
                      <Select
                        size="sm"
                        value={member.role}
                        onValueChange={(v) => changeRole(member, v as MemberRole)}
                        options={(Object.keys(ROLE_LABEL) as MemberRole[]).map((role) => ({
                          value: role,
                          label: ROLE_LABEL[role],
                        }))}
                        className="w-36"
                        aria-label={`Role for ${member.name}`}
                      />
                    )}
                  </Td>
                  <Td className="text-text-secondary">{member.zones}</Td>
                  <Td className="text-text-secondary">
                    {member.status === 'invited' ? (
                      <span className="text-micro bg-warning-bg text-warning-text rounded-xs px-sm py-xs">Invite sent</span>
                    ) : (
                      member.lastSeen
                    )}
                  </Td>
                  <Td className="text-right">
                    {!member.isYou && (
                      <button onClick={() => setPendingRemove(member)} className="text-label text-danger-text hover:underline">
                        Remove
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <section className="space-y-md">
        <h2 className="text-section-title text-text-primary">What each role can do</h2>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Capability</Th>
                <Th className="text-center">Viewer</Th>
                <Th className="text-center">Editor</Th>
                <Th className="text-center">Owner</Th>
              </tr>
            </thead>
            <tbody>
              {ROLE_CAPABILITIES.map((row) => (
                <tr key={row.capability}>
                  <Td className="text-text-secondary">{row.capability}</Td>
                  {([row.viewer, row.editor, row.owner] as boolean[]).map((allowed, i) => (
                    <Td key={i} className={cn('text-center', allowed ? 'text-success-icon' : 'text-text-muted')}>
                      {allowed ? <IconCheck className="inline" /> : '—'}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <div className="flex flex-wrap items-center justify-between gap-md">
          <p className="text-caption text-text-muted">Seats beyond {seatsLimit} need a higher plan.</p>
          <Link href="/profile" className="text-body text-info no-underline hover:underline">
            Compare plans
          </Link>
        </div>
      </section>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false)
          refetch()
        }}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Remove ${pendingRemove?.name ?? ''}?`}
        description="They lose access to this workspace. Zones and captures are unaffected."
        confirmLabel="Remove member"
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}

/** The seat limit is enforced by the server, which returns the message to show. */
function InviteDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean
  onClose: () => void
  onInvited: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('viewer')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function invite() {
    setSaving(true)
    setError(null)
    try {
      await teamApi.inviteMember({ email, role })
      setEmail('')
      onInvited()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[26rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <Dialog.Title className="text-section-title text-text-primary mb-lg">Invite member</Dialog.Title>
          <div className="space-y-lg">
            {error && <Alert variant="warning">{error}</Alert>}
            <div className="space-y-xs">
              <FormLabel htmlFor="invite-email">Work email</FormLabel>
              <Input
                id="invite-email"
                type="email"
                placeholder="name@agency.go.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-xs">
              <FormLabel htmlFor="invite-role">Role</FormLabel>
              <Select
                id="invite-role"
                value={role}
                onValueChange={(v) => setRole(v as MemberRole)}
                options={[
                  { value: 'viewer', label: 'Viewer — watch and download' },
                  { value: 'editor', label: 'Editor — change zones and schedules' },
                ]}
                className="w-full"
                modal={false}
              />
            </div>
          </div>
          <div className="flex justify-end gap-sm mt-xl">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={invite} disabled={saving || !email.includes('@')}>
              {saving ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
