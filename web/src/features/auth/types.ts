export type Plan = 'free' | 'standard' | 'premium'

/**
 * Platform-level role, distinct from the workspace-scoped MemberRole in
 * features/team. `internal` is Maceut staff and gates the /internal area.
 */
export type PlatformRole = 'user' | 'internal'

/** Workspace-scoped role. Distinct from PlatformRole, which gates /internal. */
export type MemberRole = 'owner' | 'editor' | 'viewer'

export interface User {
  id: string
  email: string
  fullName: string
  organisation: string
  /** The workspace's plan — seats, zones and captures are what the account bought. */
  plan: Plan
  role: PlatformRole
  /** The workspace this session is acting in. */
  workspaceId: string
  workspaceName: string
  /**
   * What this person may do here. Screens hide actions the API would refuse — a
   * Viewer shown a Delete button gets a 403 and no explanation.
   */
  memberRole: MemberRole
  /** Cleared once the user finishes the onboarding wizard (3p). */
  onboardingDone: boolean
  createdAt: string
}

export interface LoginInput {
  email: string
  password: string
}

/** Plan is not chosen here — it's picked in step 2 (/onboarding). */
export interface RegisterInput {
  fullName: string
  organisation: string
  email: string
  password: string
}
