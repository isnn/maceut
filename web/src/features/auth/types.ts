export type Plan = 'free' | 'standard' | 'premium'

/**
 * `user` is a paying customer; `internal` is Maceut staff and gates the /internal
 * area. Internal accounts are not customers and are excluded from user counts and
 * revenue figures.
 */
export type PlatformRole = 'user' | 'internal'

/**
 * FE-34 — the two kinds of staff. A superadmin runs the platform (config, HERE budget,
 * staff, accounts); an admin helps customers (Overview, Users, usage, plan changes).
 */
export type StaffType = 'superadmin' | 'admin'

/** An account's access level: a customer, or one of the two staff types. */
export type Access = 'user' | StaffType

export const ACCESS_LABEL: Record<Access, string> = { user: 'Customer', admin: 'Admin', superadmin: 'Superadmin' }

/** Customer, admin or superadmin — what the server's role + staff type amount to. */
export function accessOf(u: { role: PlatformRole; staffType?: StaffType | null }): Access {
  return u.role === 'internal' ? (u.staffType ?? 'admin') : 'user'
}

export interface User {
  id: string
  email: string
  fullName: string
  plan: Plan
  role: PlatformRole
  /** `superadmin` / `admin` for staff, null for customers (FE-34). */
  staffType?: StaffType | null
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
