import { eq, and, sql, desc, asc } from 'drizzle-orm'
import { db } from '../lib/drizzle-client'
import { workspaces, workspaceMembers, workspacePlans, userPreferences, user } from '../../drizzle/schema'
import type { Plan } from '../types/plan'
import type { MemberRole, MemberStatus } from '../types/workspace'

/** Data access for workspaces, membership and plans. No rules — those are in the service. */

export type WorkspaceRow = typeof workspaces.$inferSelect
export type MemberRow = typeof workspaceMembers.$inferSelect

export interface MemberWithUser extends MemberRow {
  userName: string | null
  userOrganisation: string | null
}

export async function findWorkspaceById(id: string): Promise<WorkspaceRow | undefined> {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)
  return rows[0]
}

/**
 * Every workspace this user belongs to, personal one first.
 *
 * Ordered by role so the workspace they own leads — it is the sensible default when
 * nothing else says which to open.
 */
export async function findWorkspacesForUser(
  userId: string,
): Promise<{ workspace: WorkspaceRow; role: MemberRole }[]> {
  const rows = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, 'active')))
    .orderBy(sql`CASE ${workspaceMembers.role} WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END`, asc(workspaces.createdAt))

  return rows.map((r) => ({ workspace: r.workspace, role: r.role as MemberRole }))
}

export async function findMembership(
  workspaceId: string,
  userId: string,
): Promise<MemberRow | undefined> {
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return rows[0]
}

export async function findMemberById(id: string): Promise<MemberRow | undefined> {
  const rows = await db.select().from(workspaceMembers).where(eq(workspaceMembers.id, id)).limit(1)
  return rows[0]
}

/** Members of a workspace, with the user record joined where they have signed up. */
export async function listMembers(workspaceId: string): Promise<MemberWithUser[]> {
  const rows = await db
    .select({ member: workspaceMembers, userName: user.name, userOrganisation: user.organisation })
    .from(workspaceMembers)
    .leftJoin(user, eq(user.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(sql`CASE ${workspaceMembers.role} WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END`, asc(workspaceMembers.invitedAt))

  return rows.map((r) => ({ ...r.member, userName: r.userName, userOrganisation: r.userOrganisation }))
}

/** Seats in use. Invited-but-not-joined members count — the seat is reserved. */
export async function countMembers(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
  return rows[0]?.count ?? 0
}

export async function countByRole(workspaceId: string, role: MemberRole): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, role)))
  return rows[0]?.count ?? 0
}

/** Case-insensitive, matching the functional unique index from migration 0007. */
export async function findMemberByEmail(workspaceId: string, email: string): Promise<MemberRow | undefined> {
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`lower(${workspaceMembers.email}) = lower(${email})`))
    .limit(1)
  return rows[0]
}

export interface CreateWorkspaceInput {
  name: string
  ownerUserId: string
  ownerEmail: string
  plan?: Plan
}

/**
 * Creates a workspace with its owner and plan row in one transaction.
 *
 * All three or none: a workspace with no owner is unreachable, and one with no plan
 * row makes every limit check guess.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRow> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(workspaces).values({ name: input.name }).returning()
    const workspace = inserted[0]
    if (!workspace) throw new Error('insert into workspaces returned no row')

    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: input.ownerUserId,
      email: input.ownerEmail,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
    })

    await tx.insert(workspacePlans).values({ workspaceId: workspace.id, plan: input.plan ?? 'free' })

    return workspace
  })
}

export async function addMember(input: {
  workspaceId: string
  email: string
  role: MemberRole
  userId?: string | null
  status?: MemberStatus
}): Promise<MemberRow> {
  const rows = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: input.workspaceId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      userId: input.userId ?? null,
      status: input.status ?? 'invited',
      joinedAt: input.status === 'active' ? new Date() : null,
    })
    .returning()

  const row = rows[0]
  if (!row) throw new Error('insert into workspace_members returned no row')
  return row
}

export async function updateMember(
  id: string,
  patch: Partial<Pick<MemberRow, 'role' | 'status' | 'userId' | 'joinedAt'>>,
): Promise<MemberRow | undefined> {
  const rows = await db
    .update(workspaceMembers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workspaceMembers.id, id))
    .returning()
  return rows[0]
}

export async function removeMember(id: string): Promise<void> {
  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, id))
}

/**
 * Links outstanding invitations to a user account once that address signs up.
 *
 * Without this an invite sent before the person registered would sit `invited`
 * forever, and they would never see the workspace they were invited to.
 */
export async function claimInvitations(userId: string, email: string): Promise<number> {
  const rows = await db
    .update(workspaceMembers)
    .set({ userId, status: 'active', joinedAt: new Date(), updatedAt: new Date() })
    .where(and(sql`lower(${workspaceMembers.email}) = lower(${email})`, sql`${workspaceMembers.userId} IS NULL`))
    .returning({ id: workspaceMembers.id })
  return rows.length
}

export async function getPlan(workspaceId: string): Promise<Plan> {
  const rows = await db
    .select({ plan: workspacePlans.plan })
    .from(workspacePlans)
    .where(eq(workspacePlans.workspaceId, workspaceId))
    .limit(1)
  // A missing plan row falls back to free rather than erroring — it is a data problem,
  // not a reason to lock a workspace out of its own screens.
  return (rows[0]?.plan ?? 'free') as Plan
}

export async function setPlan(workspaceId: string, plan: Plan): Promise<void> {
  const updated = await db
    .update(workspacePlans)
    .set({ plan, startedAt: new Date() })
    .where(eq(workspacePlans.workspaceId, workspaceId))
    .returning({ id: workspacePlans.id })

  if (updated.length === 0) {
    await db.insert(workspacePlans).values({ workspaceId, plan })
  }
}

export async function getActiveWorkspaceId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ id: userPreferences.activeWorkspaceId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
  return rows[0]?.id ?? null
}

export async function setActiveWorkspace(userId: string, workspaceId: string): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, activeWorkspaceId: workspaceId })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { activeWorkspaceId: workspaceId, updatedAt: new Date() },
    })
}

/** Platform-wide counts for the /internal overview. */
export async function countAllWorkspaces(): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(workspaces)
  return rows[0]?.count ?? 0
}

export async function listWorkspacesWithPlans(): Promise<{ id: string; name: string; plan: Plan; createdAt: Date }[]> {
  const rows = await db
    .select({ id: workspaces.id, name: workspaces.name, plan: workspacePlans.plan, createdAt: workspaces.createdAt })
    .from(workspaces)
    .leftJoin(workspacePlans, eq(workspacePlans.workspaceId, workspaces.id))
    .orderBy(desc(workspaces.createdAt))
  return rows.map((r) => ({ ...r, plan: (r.plan ?? 'free') as Plan }))
}
