export type Plan = 'free' | 'standard' | 'premium'

export interface User {
  id: string
  email: string
  fullName: string
  organisation: string
  plan: Plan
  /** Cleared once the user finishes the onboarding wizard (3p). */
  onboardingDone: boolean
  createdAt: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  fullName: string
  organisation: string
  email: string
  password: string
  plan: Plan
}
