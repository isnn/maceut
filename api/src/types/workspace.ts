/**
 * Workspace-scoped roles and what each may do.
 *
 * Distinct from `PlatformRole` in types/plan.ts: that one (`user` / `internal`) says
 * whether someone is Maceut staff and gates `/internal`. This one says what they may
 * do inside one customer's workspace. A Maceut operator is not an owner of anyone's
 * workspace, and an owner has no access to `/internal` — two separate questions that
 * a single role field would have conflated.
 */

export type MemberRole = 'owner' | 'editor' | 'viewer'
export type MemberStatus = 'active' | 'invited'

export const MEMBER_ROLES: readonly MemberRole[] = ['owner', 'editor', 'viewer'] as const

/**
 * Capabilities, transcribed from the matrix the Team screen renders
 * (`web/src/features/team/api.ts` ROLE_CAPABILITIES). The UI shows this table to
 * explain the roles, so if the two disagree the product is lying to the user —
 * `team.controller.test.ts` asserts they match.
 */
export const ROLE_CAPABILITIES = {
  /** View zones and captures. */
  read: { viewer: true, editor: true, owner: true },
  /** Render and download animations. */
  render: { viewer: false, editor: true, owner: true },
  /** Create zones and edit schedules. */
  write: { viewer: false, editor: true, owner: true },
  /** Invite members and change plan. */
  manage: { viewer: false, editor: false, owner: true },
} as const

export type Capability = keyof typeof ROLE_CAPABILITIES

export function can(role: MemberRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[capability][role]
}

/** Ordered weakest to strongest, for "at least this role" checks. */
const RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, owner: 2 }

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return RANK[role] >= RANK[minimum]
}

export interface WorkspaceContext {
  workspaceId: string
  workspaceName: string
  role: MemberRole
}
