export type Plan = 'free' | 'standard' | 'premium'

/**
 * Platform-level role, distinct from the workspace-scoped MemberRole in
 * features/team. `internal` is Maceut staff and gates the /internal area.
 */
export type PlatformRole = 'user' | 'internal'

export interface User {
  id: string
  email: string
  fullName: string
  organisation: string
  plan: Plan
  role: PlatformRole
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
