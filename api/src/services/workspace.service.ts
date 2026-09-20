import * as workspaceRepo from '../repositories/workspace.repository'
import * as userRepo from '../repositories/user.repository'
import { NotFoundError, ForbiddenError, ValidationError } from '../errors'
import { PLAN_LIMITS, type Plan } from '../types/plan'
import { can, roleAtLeast, type Capability, type MemberRole, type WorkspaceContext } from '../types/workspace'

/**
 * Workspaces: resolution, membership, and the rules around both.
 *
 * Every resource in the app belongs to a workspace. This module answers the two
 * questions every request needs: which workspace is this person acting in, and what
 * are they allowed to do there.
 */

export interface PublicMember {
  id: string
  name: string
  email: string
  unit: string
  role: MemberRole
  /** Zone names, or "all" — the Team screen renders this string directly. */
  zones: string
  lastSeen: string
  status: 'active' | 'invited'
  isYou: boolean
}

export interface PublicWorkspace {
  id: string
  name: string
  role: MemberRole
  plan: Plan
}

/**
 * Makes sure the user has a workspace, and returns the one they are acting in.
 *
 * Called on every `/me`, so it is also where an account created by Better Auth — which
 * knows nothing about workspaces — gets its personal one. Three things happen in
 * order, and the order matters:
 *
 *   1. Outstanding invitations addressed to this email are claimed. Someone invited
 *      before they registered would otherwise never see the workspace.
 *   2. If they still belong to nothing, a personal workspace is created. Doing this
 *      *after* claiming means an invited user does not get a stray empty workspace
 *      they never asked for.
 *   3. Their stored active workspace is validated against current membership — being
 *      removed from a workspace must not leave them pointed at it.
 */
export async function ensureWorkspace(userId: string): Promise<WorkspaceContext> {
  const account = await userRepo.findById(userId)
  if (!account) throw new NotFoundError('User')

  await workspaceRepo.claimInvitations(userId, account.email)

  let memberships = await workspaceRepo.findWorkspacesForUser(userId)

  if (memberships.length === 0) {
    const name = account.organisation?.trim() || account.name || account.email.split('@')[0] || 'Workspace'
    const created = await workspaceRepo.createWorkspace({
      name,
      ownerUserId: userId,
      ownerEmail: account.email,
      plan: 'free', // BR-001
    })
    memberships = [{ workspace: created, role: 'owner' }]
    await workspaceRepo.setActiveWorkspace(userId, created.id)
  }

  const storedId = await workspaceRepo.getActiveWorkspaceId(userId)
  const active = memberships.find((m) => m.workspace.id === storedId) ?? memberships[0]!

  // Repair a stale pointer — removed from the workspace, or it was deleted.
  if (storedId !== active.workspace.id) {
    await workspaceRepo.setActiveWorkspace(userId, active.workspace.id)
  }

  return { workspaceId: active.workspace.id, workspaceName: active.workspace.name, role: active.role }
}

export async function listWorkspaces(userId: string): Promise<PublicWorkspace[]> {
  const memberships = await workspaceRepo.findWorkspacesForUser(userId)
  return Promise.all(
    memberships.map(async (m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      plan: await workspaceRepo.getPlan(m.workspace.id),
    })),
  )
}

export async function switchWorkspace(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const membership = await workspaceRepo.findMembership(workspaceId, userId)
  // 404 rather than 403: telling someone a workspace exists but is not theirs leaks
  // that it exists at all.
  if (!membership || membership.status !== 'active') throw new NotFoundError('Workspace')

  await workspaceRepo.setActiveWorkspace(userId, workspaceId)
  const workspace = await workspaceRepo.findWorkspaceById(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace')

  return { workspaceId, workspaceName: workspace.name, role: membership.role as MemberRole }
}

/** Throws unless the role carries the capability. Used by routes that write. */
export function requireCapability(role: MemberRole, capability: Capability): void {
  if (!can(role, capability)) {
    throw new ForbiddenError(
      capability === 'manage'
        ? 'Hanya Owner yang bisa mengelola anggota dan paket.'
        : 'Peran Anda di workspace ini hanya bisa melihat, tidak mengubah.',
    )
  }
}

// --- Members -------------------------------------------------------------------

function toPublicMember(
  row: workspaceRepo.MemberWithUser,
  currentUserId: string,
  zoneSummary: string,
): PublicMember {
  return {
    id: row.id,
    // A pending invite has no account yet, so the address is all we can show.
    name: row.userName ?? row.email.split('@')[0] ?? row.email,
    email: row.email,
    unit: row.userOrganisation ?? '—',
    role: row.role as MemberRole,
    zones: zoneSummary,
    lastSeen: row.status === 'invited' ? 'Belum bergabung' : (row.joinedAt ?? row.invitedAt).toISOString(),
    status: row.status as 'active' | 'invited',
    isYou: row.userId === currentUserId,
  }
}

export async function listMembers(workspaceId: string, currentUserId: string): Promise<PublicMember[]> {
  const rows = await workspaceRepo.listMembers(workspaceId)
  // Everyone in a workspace sees every zone in it — access is per workspace, not per
  // zone. Per-zone grants would need their own table and are not specced.
  return rows.map((r) => toPublicMember(r, currentUserId, 'all'))
}

export async function inviteMember(
  workspaceId: string,
  actorRole: MemberRole,
  input: { email: string; role: MemberRole },
): Promise<PublicMember> {
  requireCapability(actorRole, 'manage')

  const email = input.email.trim().toLowerCase()

  if (input.role === 'owner') {
    // Transferring ownership is a different operation with different consequences
    // (the current owner loses billing control). Not specced, so not silently allowed.
    throw new ValidationError('Tidak bisa mengundang sebagai Owner. Undang sebagai Editor atau Viewer lebih dulu.')
  }

  if (await workspaceRepo.findMemberByEmail(workspaceId, email)) {
    throw new ValidationError('Email ini sudah ada di workspace.')
  }

  // Seat limit (PLAN_LIMITS.seatsLimit). Invited-but-not-joined members count: the
  // seat is reserved the moment the invitation goes out, otherwise a workspace could
  // invite past its limit and only discover it when people accept.
  const plan = await workspaceRepo.getPlan(workspaceId)
  const limit = PLAN_LIMITS[plan].seatsLimit
  if ((await workspaceRepo.countMembers(workspaceId)) >= limit) {
    throw new ValidationError(`Paket Anda dibatasi ${limit} anggota. Naikkan paket untuk menambah.`, { limit, plan })
  }

  // If this address already has an account, they join immediately — there is no
  // invitation email to send yet, so a pending state nobody can act on would be worse.
  const existing = await userRepo.findByEmail(email)
  const member = await workspaceRepo.addMember({
    workspaceId,
    email,
    role: input.role,
    userId: existing?.id ?? null,
    status: existing ? 'active' : 'invited',
  })

  const rows = await workspaceRepo.listMembers(workspaceId)
  const full = rows.find((r) => r.id === member.id)!
  return toPublicMember(full, '', 'all')
}

export async function changeMemberRole(
  workspaceId: string,
  actorUserId: string,
  actorRole: MemberRole,
  memberId: string,
  role: MemberRole,
): Promise<PublicMember> {
  requireCapability(actorRole, 'manage')

  const member = await workspaceRepo.findMemberById(memberId)
  if (!member || member.workspaceId !== workspaceId) throw new NotFoundError('Anggota')

  if (member.userId === actorUserId) {
    throw new ForbiddenError('Anda tidak bisa mengubah peran Anda sendiri.')
  }

  // Never leave a workspace without an owner — it would become unmanageable, with no
  // way to invite anyone or change the plan, and no API path back.
  if (member.role === 'owner' && role !== 'owner') {
    if ((await workspaceRepo.countByRole(workspaceId, 'owner')) <= 1) {
      throw new ValidationError('Ini satu-satunya Owner — angkat Owner lain sebelum menurunkan yang ini.')
    }
  }

  await workspaceRepo.updateMember(memberId, { role })

  const rows = await workspaceRepo.listMembers(workspaceId)
  return toPublicMember(rows.find((r) => r.id === memberId)!, actorUserId, 'all')
}

export async function removeMember(
  workspaceId: string,
  actorUserId: string,
  actorRole: MemberRole,
  memberId: string,
): Promise<void> {
  requireCapability(actorRole, 'manage')

  const member = await workspaceRepo.findMemberById(memberId)
  if (!member || member.workspaceId !== workspaceId) throw new NotFoundError('Anggota')

  if (member.userId === actorUserId) {
    throw new ForbiddenError('Anda tidak bisa mengeluarkan diri sendiri. Serahkan kepemilikan lebih dulu.')
  }
  if (member.role === 'owner' && (await workspaceRepo.countByRole(workspaceId, 'owner')) <= 1) {
    throw new ValidationError('Ini satu-satunya Owner — workspace tidak boleh kehilangan semua Owner.')
  }

  await workspaceRepo.removeMember(memberId)
}

export { roleAtLeast }
