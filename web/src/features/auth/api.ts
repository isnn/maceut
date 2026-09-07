// TODO: replace with real fetch through @/lib/api-client once api/ exists
// (POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me).
// Mock persists a fake user table + session in localStorage so the
// register -> onboarding -> dashboard flow is demoable end-to-end without a backend.

import type { LoginInput, Plan, RegisterInput, User } from './types'
import { ApiError } from '@/types/api'
import { generateId } from '@/lib/utils'

interface MockUserRecord {
  id: string
  email: string
  password: string
  fullName: string
  organisation: string
  plan: Plan
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
  return parsed.map((u) => ({
    id: u.id!,
    email: u.email!,
    password: u.password!,
    fullName: u.fullName ?? u.email!.split('@')[0],
    organisation: u.organisation ?? '',
    plan: u.plan ?? 'free',
    onboardingDone: u.onboardingDone ?? true,
    createdAt: u.createdAt ?? new Date().toISOString(),
  }))
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
    onboardingDone: record.onboardingDone,
    createdAt: record.createdAt,
  }
}

export async function register(input: RegisterInput): Promise<User> {
  const users = readUsers()
  if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    await delay(null)
    throw new ApiError({ code: 'EMAIL_ALREADY_TAKEN', message: 'Email sudah terdaftar.' })
  }
  const record: MockUserRecord = {
    id: generateId(),
    email: input.email,
    password: input.password,
    fullName: input.fullName,
    organisation: input.organisation,
    plan: input.plan,
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
    throw new ApiError({ code: 'INVALID_CREDENTIALS', message: 'Email atau password salah.' })
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

async function patchCurrentUser(patch: Partial<MockUserRecord>): Promise<User> {
  const userId = window.localStorage.getItem(SESSION_KEY)
  const users = readUsers()
  const record = users.find((u) => u.id === userId)
  if (!record) {
    await delay(null)
    throw new ApiError({ code: 'UNAUTHORIZED', message: 'Sesi Anda berakhir, silakan login kembali.' })
  }
  const updated = { ...record, ...patch }
  writeUsers(users.map((u) => (u.id === updated.id ? updated : u)))
  return delay(toPublicUser(updated))
}
