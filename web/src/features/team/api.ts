/**
 * Team, against the real backend (GET/POST /team, PATCH/DELETE /team/:id).
 *
 * Membership is real now: an invited Editor signs in, switches to this workspace, and
 * sees its zones and schedules. Before the workspace model existed the screen could
 * list members but sharing was structurally impossible, because every resource
 * belonged to a user id.
 *
 * Roles are enforced server-side. A Viewer sent the buttons anyway would get a 403,
 * so the screens read `memberRole` from `/me` and hide what the API would refuse.
 */

import { apiClient } from '@/lib/api-client'

export type MemberRole = 'owner' | 'editor' | 'viewer'
export type MemberStatus = 'active' | 'invited'

export interface Member {
  id: string
  name: string
  email: string
  unit: string
  role: MemberRole
  /** Zone names, or "all" for workspace-wide access. */
  zones: string
  lastSeen: string
  status: MemberStatus
  isYou?: boolean
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

/**
 * The capability matrix rendered under the member table (3n).
 *
 * Mirrors `ROLE_CAPABILITIES` in `api/src/types/workspace.ts`, which the server also
 * exposes at `GET /team/capabilities`. Kept here as the render source so the table
 * does not depend on a round trip, and asserted against the server's copy by
 * `api/src/controllers/team.controller.test.ts` — a table that promised an Editor
 * something the API refuses would be the product lying to the user.
 */
export const ROLE_CAPABILITIES: { capability: string; viewer: boolean; editor: boolean; owner: boolean }[] = [
  { capability: 'View zones and captures', viewer: true, editor: true, owner: true },
  { capability: 'Render and download animations', viewer: false, editor: true, owner: true },
  { capability: 'Create zones and edit schedules', viewer: false, editor: true, owner: true },
  { capability: 'Invite members and change plan', viewer: false, editor: false, owner: true },
]

/**
 * No `currentUser` argument — the server marks `isYou` from the session, which is the
 * only copy that cannot be edited in devtools.
 */
export async function getMembers(): Promise<Member[]> {
  return apiClient.get<Member[]>('/team')
}

export async function inviteMember(input: { email: string; role: MemberRole }): Promise<Member> {
  return apiClient.post<Member>('/team/invite', input)
}

export async function updateMemberRole(id: string, role: MemberRole): Promise<void> {
  await apiClient.patch<Member>(`/team/${id}/role`, { role })
}

export async function removeMember(id: string): Promise<void> {
  await apiClient.delete<{ removed: boolean }>(`/team/${id}`)
}

// --- Workspaces ----------------------------------------------------------------

export interface Workspace {
  id: string
  name: string
  role: MemberRole
  plan: 'free' | 'standard' | 'premium'
}

/**
 * Every workspace this account can reach.
 *
 * Someone can own their personal workspace *and* be invited into others, so this is
 * a list rather than a single value. `activeWorkspaceId` is the one currently open.
 */
export async function getWorkspaces(): Promise<{ workspaces: Workspace[]; activeWorkspaceId: string }> {
  return apiClient.get<{ workspaces: Workspace[]; activeWorkspaceId: string }>('/workspaces')
}

export async function switchWorkspace(workspaceId: string): Promise<{ workspaceId: string; workspaceName: string; role: MemberRole }> {
  return apiClient.post('/workspaces/switch', { workspaceId })
}
