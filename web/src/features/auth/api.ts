// TODO: replace with real fetch through @/lib/api-client once api/ exists
// (POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me).
// Mock persists a fake user table + session in localStorage so the
// register -> onboarding -> dashboard flow is demoable end-to-end without a backend.

import type { LoginInput, Plan, PlatformRole, RegisterInput, User } from './types'
import { ApiError } from '@/types/api'
import { generateId } from '@/lib/utils'

interface MockUserRecord {
  id: string
  email: string
  password: string
  fullName: string
  organisation: string
  plan: Plan
  role: PlatformRole
  onboardingDone: boolean
  createdAt: string
}

const USERS_KEY = 'maceut_mock_users'
const SESSION_KEY = 'maceut_session'
const MOCK_LATENCY_MS = 400

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

function readUsers(): MockUserRecord[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(USERS_KEY)
  if (!raw) return []
  const parsed = JSON.parse(raw) as Partial<MockUserRecord>[]
  // Records created before the turn 3/4 screens lack the newer fields.
  const records: MockUserRecord[] = parsed.map((u) => ({
    id: u.id!,
    email: u.email!,
    password: u.password!,
    fullName: u.fullName ?? u.email!.split('@')[0],
    organisation: u.organisation ?? '',
    plan: u.plan ?? 'free',
    role: u.role ?? 'user',
    onboardingDone: u.onboardingDone ?? true,
    createdAt: u.createdAt ?? new Date().toISOString(),
  }))

  // Someone has to be able to open /internal on a fresh install. Prefer whoever
  // is signed in — promoting the earliest account instead means the role can
  // land on a stale account the person isn't using, with no way to tell.
  if (records.length > 0 && !records.some((u) => u.role === 'internal')) {
    const sessionId = window.localStorage.getItem(SESSION_KEY)
    const target =
      records.find((u) => u.id === sessionId) ?? records.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b))
    target.role = 'internal'
    writeUsers(records)
  }

  return records
}

function writeUsers(users: MockUserRecord[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function toPublicUser(record: MockUserRecord): User {
  return {
    id: record.id,
    email: record.email,
    fullName: record.fullName,
    organisation: record.organisation,
    plan: record.plan,
    role: record.role,
    onboardingDone: record.onboardingDone,
    createdAt: record.createdAt,
  }
}

export async function register(input: RegisterInput): Promise<User> {
  const users = readUsers()
  if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    await delay(null)
    throw new ApiError({ code: 'EMAIL_ALREADY_TAKEN', message: 'That email is already registered.' })
  }
  const record: MockUserRecord = {
    id: generateId(),
    email: input.email,
    password: input.password,
    fullName: input.fullName,
    organisation: input.organisation,
    // Placeholder until step 2 of sign-up; the onboarding guard forces that step.
    plan: 'free',
    role: 'user',
    onboardingDone: false,
    createdAt: new Date().toISOString(),
  }
  writeUsers([...users, record])
  window.localStorage.setItem(SESSION_KEY, record.id)
  return delay(toPublicUser(record))
}

export async function login(input: LoginInput): Promise<User> {
  const users = readUsers()
  const record = users.find((u) => u.email.toLowerCase() === input.email.toLowerCase())
  if (!record || record.password !== input.password) {
    await delay(null)
    throw new ApiError({ code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' })
  }
  window.localStorage.setItem(SESSION_KEY, record.id)
  return delay(toPublicUser(record))
}

export async function logout(): Promise<void> {
  window.localStorage.removeItem(SESSION_KEY)
  await delay(null)
}

export async function getMe(): Promise<User | null> {
  if (typeof window === 'undefined') return null
  const userId = window.localStorage.getItem(SESSION_KEY)
  if (!userId) return delay(null)
  const record = readUsers().find((u) => u.id === userId)
  return delay(record ? toPublicUser(record) : null)
}

/** Used by onboarding (3p) and the plan cards on Profile & usage (3o). */
export async function updatePlan(plan: Plan): Promise<User> {
  return patchCurrentUser({ plan })
}

export async function completeOnboarding(): Promise<User> {
  return patchCurrentUser({ onboardingDone: true })
}

/**
 * Prototype-only escape hatch so the staff area is reachable without editing
 * localStorage by hand. It exists because the mock has no way to provision an
 * internal account out of band — a real backend grants this role server-side
 * and no such endpoint should ever ship.
 */
export async function grantSelfInternal(): Promise<User> {
  return patchCurrentUser({ role: 'internal' })
}

async function patchCurrentUser(patch: Partial<MockUserRecord>): Promise<User> {
  const userId = window.localStorage.getItem(SESSION_KEY)
  const users = readUsers()
  const record = users.find((u) => u.id === userId)
  if (!record) {
    await delay(null)
    throw new ApiError({ code: 'UNAUTHORIZED', message: 'Your session has ended. Please log in again.' })
  }
  const updated = { ...record, ...patch }
  writeUsers(users.map((u) => (u.id === updated.id ? updated : u)))
  return delay(toPublicUser(updated))
}

// --- Platform directory (used by /internal) ------------------------------------
// Guards live here rather than in the pages, matching the repo's rule that
// business rules are enforced in the service layer, never the caller (BR-007).

export interface SeedUserInput {
  fullName: string
  organisation: string
  email: string
  plan: Plan
  createdAt: string
}

export async function listUsers(): Promise<User[]> {
  return delay(readUsers().map(toPublicUser))
}

export async function setUserRole(userId: string, role: PlatformRole): Promise<User> {
  const users = readUsers()
  const target = users.find((u) => u.id === userId)
  if (!target) {
    await delay(null)
    throw new ApiError({ code: 'NOT_FOUND', message: 'Account not found.' })
  }
  if (userId === window.localStorage.getItem(SESSION_KEY)) {
    await delay(null)
    throw new ApiError({
      code: 'CANNOT_CHANGE_OWN_ROLE',
      message: 'You cannot change your own role — ask another internal user to do it.',
    })
  }
  if (target.role === 'internal' && role !== 'internal') {
    const othersInternal = users.filter((u) => u.role === 'internal' && u.id !== userId).length
    if (othersInternal === 0) {
      await delay(null)
      throw new ApiError({
        code: 'LAST_INTERNAL',
        message: 'This is the last internal account — promote someone else before demoting it.',
      })
    }
  }
  const updated = { ...target, role }
  writeUsers(users.map((u) => (u.id === userId ? updated : u)))
  return delay(toPublicUser(updated))
}

export async function setUserPlan(userId: string, plan: Plan): Promise<User> {
  const users = readUsers()
  const target = users.find((u) => u.id === userId)
  if (!target) {
    await delay(null)
    throw new ApiError({ code: 'NOT_FOUND', message: 'Account not found.' })
  }
  const updated = { ...target, plan }
  writeUsers(users.map((u) => (u.id === userId ? updated : u)))
  return delay(toPublicUser(updated))
}

/**
 * Appends demo tenants to the same table real accounts live in, so the
 * directory and auth never disagree. Existing rows are never touched.
 */
export async function seedUsers(inputs: SeedUserInput[]): Promise<void> {
  const users = readUsers()
  const existing = new Set(users.map((u) => u.email.toLowerCase()))
  const seeded: MockUserRecord[] = inputs
    .filter((input) => !existing.has(input.email.toLowerCase()))
    .map((input) => ({
      id: generateId(),
      email: input.email,
      password: generateId(),
      fullName: input.fullName,
      organisation: input.organisation,
      plan: input.plan,
      role: 'user',
      onboardingDone: true,
      createdAt: input.createdAt,
    }))
  if (seeded.length > 0) writeUsers([...users, ...seeded])
  await delay(null)
}
