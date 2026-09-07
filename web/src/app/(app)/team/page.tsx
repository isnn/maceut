'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/Button'
import { FormLabel, Input, Select } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import { PLAN_LABEL, PLAN_LIMITS } from '@/lib/constants'
import { ApiError } from '@/types/api'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as teamApi from '@/features/team/api'
import { ROLE_CAPABILITIES, ROLE_LABEL, type Member, type MemberRole } from '@/features/team/api'

export default function TeamPage() {
  const { user } = useCurrentUser()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null)

  const plan = user?.plan ?? 'free'
  const seatsLimit = PLAN_LIMITS[plan].seatsLimit

  const load = useCallback(
    () => (user ? teamApi.getMembers({ fullName: user.fullName, email: user.email }) : Promise.resolve(null)),
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
            {seatsUsed} dari {seatsLimit} kursi terpakai · paket {PLAN_LABEL[plan]}
          </p>
          <h1 className="text-page-title font-bold text-text-primary mt-xs">Anggota</h1>
          <p className="text-body text-text-secondary mt-xs max-w-[64ch]">
            Owner dan Editor bisa mengubah zona dan jadwal. Viewer hanya bisa melihat dan mengunduh.
          </p>
        </div>
        <Button className="h-11 px-lg" onClick={() => setInviteOpen(true)}>
          Undang anggota
        </Button>
      </div>

      {members === null ? (
        <div className="h-64 bg-canvas-secondary rounded-lg animate-pulse" />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Orang</Th>
                <Th>Peran</Th>
                <Th>Zona</Th>
                <Th>Terakhir aktif</Th>
                <Th className="text-right">Aksi</Th>
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
                          {member.isYou && <span className="ml-sm text-micro text-text-muted font-normal">Anda</span>}
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
                        value={member.role}
                        onChange={(e) => changeRole(member, e.target.value as MemberRole)}
                        className="h-9 w-36 px-md"
                        aria-label={`Peran ${member.name}`}
                      >
                        {(Object.keys(ROLE_LABEL) as MemberRole[]).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Td>
                  <Td className="text-text-secondary">{member.zones}</Td>
                  <Td className="text-text-secondary">
                    {member.status === 'invited' ? (
                      <span className="text-micro bg-warning-bg text-warning-text rounded-xs px-sm py-xs">Undangan terkirim</span>
                    ) : (
                      member.lastSeen
                    )}
                  </Td>
                  <Td className="text-right">
                    {!member.isYou && (
                      <button onClick={() => setPendingRemove(member)} className="text-label text-danger-text hover:underline">
                        Keluarkan
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
        <h2 className="text-section-title text-text-primary">Apa yang bisa dilakukan tiap peran</h2>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Kemampuan</Th>
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
                      {allowed ? '✓' : '—'}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <div className="flex flex-wrap items-center justify-between gap-md">
          <p className="text-caption text-text-muted">Kursi di atas {seatsLimit} membutuhkan paket lebih tinggi.</p>
          <Link href="/profile" className="text-body text-info no-underline hover:underline">
            Bandingkan paket
          </Link>
        </div>
      </section>

      <InviteDialog
        open={inviteOpen}
        plan={plan}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false)
          refetch()
        }}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Keluarkan ${pendingRemove?.name ?? ''}?`}
        description="Orang ini kehilangan akses ke workspace. Zona dan capture tidak terpengaruh."
        confirmLabel="Keluarkan"
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}

function InviteDialog({
  open,
  plan,
  onClose,
  onInvited,
}: {
  open: boolean
  plan: 'free' | 'standard' | 'premium'
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
      await teamApi.inviteMember({ email, role }, plan)
      setEmail('')
      onInvited()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan, coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[26rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <Dialog.Title className="text-section-title text-text-primary mb-lg">Undang anggota</Dialog.Title>
          <div className="space-y-lg">
            {error && <Alert variant="warning">{error}</Alert>}
            <div className="space-y-xs">
              <FormLabel htmlFor="invite-email">Email kerja</FormLabel>
              <Input
                id="invite-email"
                type="email"
                placeholder="nama@instansi.go.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-xs">
              <FormLabel htmlFor="invite-role">Peran</FormLabel>
              <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                <option value="viewer">Viewer — lihat dan unduh</option>
                <option value="editor">Editor — ubah zona dan jadwal</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-sm mt-xl">
            <Button variant="secondary" className="h-10 px-lg" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button className="h-10 px-lg" onClick={invite} disabled={saving || !email.includes('@')}>
              {saving ? 'Mengirim...' : 'Kirim undangan'}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
