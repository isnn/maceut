// TODO: replace with real fetch through @/lib/api-client once api/ exists
// (POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me).
// Mock persists a fake user table + session in localStorage so the
// register -> login -> dashboard flow is demoable end-to-end without a backend.

import type { LoginInput, Plan, RegisterInput, User } from './types'
import { ApiError } from '@/types/api'
import { generateId } from '@/lib/utils'

interface MockUserRecord {
  id: string
  email: string
  password: string
  plan: Plan
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
  return raw ? (JSON.parse(raw) as MockUserRecord[]) : []
}

function writeUsers(users: MockUserRecord[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function toPublicUser(record: MockUserRecord): User {
  return { id: record.id, email: record.email, plan: record.plan, createdAt: record.createdAt }
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
    plan: 'free',
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
