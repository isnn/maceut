// TODO: replace with real fetch through @/lib/api-client once api/ exists.
// Team/roles are out of scope for the MVP specs (product.md lists them as
// out of scope) — these screens exist because the turn 3 mockups include them.

import { ApiError } from '@/types/api'
import { PLAN_LIMITS } from '@/lib/constants'
import { generateId } from '@/lib/utils'
import type { Plan } from '@/features/auth/types'

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

/** The capability matrix rendered under the member table (3n). */
export const ROLE_CAPABILITIES: { capability: string; viewer: boolean; editor: boolean; owner: boolean }[] = [
  { capability: 'View zones and captures', viewer: true, editor: true, owner: true },
  { capability: 'Render and download animations', viewer: false, editor: true, owner: true },
  { capability: 'Create zones and edit schedules', viewer: false, editor: true, owner: true },
  { capability: 'Invite members and change plan', viewer: false, editor: false, owner: true },
]

const MEMBERS_KEY = 'maceut_mock_members'
const MOCK_LATENCY_MS = 350

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

function readMembers(): Member[] | null {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(MEMBERS_KEY)
  return raw ? (JSON.parse(raw) as Member[]) : null
}

function writeMembers(members: Member[]) {
  window.localStorage.setItem(MEMBERS_KEY, JSON.stringify(members))
}

export async function getMembers(currentUser: { fullName: string; email: string }): Promise<Member[]> {
  const stored = readMembers()
  if (stored) {
    return delay(stored.map((m) => (m.isYou ? { ...m, name: currentUser.fullName, email: currentUser.email } : m)))
  }
  const seeded: Member[] = [
    {
      id: generateId(),
      name: currentUser.fullName || 'You',
      email: currentUser.email,
      unit: 'Logistics ops',
      role: 'owner',
      zones: 'All zones',
      lastSeen: 'Now',
      status: 'active',
      isYou: true,
    },
    {
      id: generateId(),
      name: 'Dewi Anggraini',
      email: 'dewi@jakselpemda.go.id',
      unit: 'Urban planning',
      role: 'editor',
      zones: 'All zones',
      lastSeen: '1 hr ago',
      status: 'active',
    },
    {
      id: generateId(),
      name: 'Sri Handayani',
      email: 'sri@dishub.go.id',
      unit: 'Dishub liaison',
      role: 'viewer',
      zones: 'Sudirman corridor',
      lastSeen: '3 days ago',
      status: 'active',
    },
    {
      id: generateId(),
      name: 'Andi Kurniawan',
      email: 'andi@logistik.co.id',
      unit: 'Logistics ops',
      role: 'viewer',
      zones: 'Satrio – Casablanca',
      lastSeen: '—',
      status: 'invited',
    },
  ]
  writeMembers(seeded)
  return delay(seeded)
}

export async function inviteMember(input: { email: string; role: MemberRole }, plan: Plan): Promise<Member> {
  const members = readMembers() ?? []
  if (members.length >= PLAN_LIMITS[plan].seatsLimit) {
    await delay(null)
    throw new ApiError({
      code: 'SEAT_LIMIT_EXCEEDED',
      message: `Your plan includes ${PLAN_LIMITS[plan].seatsLimit} seats and all of them are taken.`,
    })
  }
  const member: Member = {
    id: generateId(),
    name: input.email.split('@')[0],
    email: input.email,
    unit: '—',
    role: input.role,
    zones: 'All zones',
    lastSeen: '—',
    status: 'invited',
  }
  writeMembers([...members, member])
  return delay(member)
}

export async function updateMemberRole(id: string, role: MemberRole): Promise<void> {
  const members = readMembers() ?? []
  writeMembers(members.map((m) => (m.id === id ? { ...m, role } : m)))
  await delay(null)
}

export async function removeMember(id: string): Promise<void> {
  const members = readMembers() ?? []
  writeMembers(members.filter((m) => m.id !== id))
  await delay(null)
}
