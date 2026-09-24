export type Plan = 'free' | 'standard' | 'premium'

/**
 * `user` is a paying customer; `internal` is Maceut staff and gates the /internal
 * area. Internal accounts are not customers and are excluded from user counts and
 * revenue figures.
 */
export type PlatformRole = 'user' | 'internal'

export interface User {
  id: string
  email: string
  fullName: string
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

/**
 * Plan is not chosen here, and not at onboarding either: every account starts on Free
 * and staff grant paid plans from /internal/users until billing exists.
 */
export interface RegisterInput {
  fullName: string
  email: string
  password: string
}
