import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../lib/drizzle-client', () => ({ checkDb: vi.fn(), closeDb: vi.fn(), db: {}, pool: {} }))
vi.mock('../lib/rabbitmq-client', () => ({ checkQueue: vi.fn(), closeQueue: vi.fn(), getChannel: vi.fn() }))
vi.mock('../lib/auth', () => ({ auth: { api: { getSession: vi.fn() }, handler: vi.fn() } }))
vi.mock('better-auth/node', () => ({
  toNodeHandler: () => (_req: unknown, res: { statusCode: number; end: (s: string) => void }) => {
    res.statusCode = 404
    res.end('')
  },
  fromNodeHeaders: (h: unknown) => h,
}))
vi.mock('../repositories/user.repository', () => ({
  findById: vi.fn(),
  findByIdWithPlan: vi.fn(),
  findByEmail: vi.fn(),
  updateUser: vi.fn(),
  listWithPlans: vi.fn(),
  countInternal: vi.fn(),
}))
vi.mock('../repositories/workspace.repository', () => ({
  getPlan: vi.fn(),
  listMembers: vi.fn(),
  countMembers: vi.fn(),
  countByRole: vi.fn(),
  findMemberByEmail: vi.fn(),
  findMemberById: vi.fn(),
  findMembership: vi.fn(),
  findWorkspaceById: vi.fn(),
  findWorkspacesForUser: vi.fn(),
  addMember: vi.fn(),
  updateMember: vi.fn(),
  removeMember: vi.fn(),
  claimInvitations: vi.fn(),
  createWorkspace: vi.fn(),
  getActiveWorkspaceId: vi.fn(),
  setActiveWorkspace: vi.fn(),
}))

import { app } from '../app'
import * as workspaceRepo from '../repositories/workspace.repository'
import * as workspaceService from '../services/workspace.service'
import * as userRepo from '../repositories/user.repository'
import { auth } from '../lib/auth'
import { ROLE_CAPABILITIES, type MemberRole } from '../types/workspace'

const USER_ID = 'user_01'
const WORKSPACE_ID = '9a1b2c3d-1111-4111-8111-111111111111'
const MEMBER_ID = '5e6f7a8b-1111-4111-8111-111111111111'

function member(over: Partial<workspaceRepo.MemberWithUser> = {}): workspaceRepo.MemberWithUser {
  return {
    id: MEMBER_ID,
    workspaceId: WORKSPACE_ID,
    userId: 'user_02',
    email: 'siti@dishubjogja.go.id',
    role: 'editor',
    status: 'active',
    invitedAt: new Date('2026-09-19T00:00:00Z'),
    joinedAt: new Date('2026-09-19T00:00:00Z'),
    createdAt: new Date('2026-09-19T00:00:00Z'),
    updatedAt: new Date('2026-09-19T00:00:00Z'),
    userName: 'Siti Aminah',
    userOrganisation: 'Dishub Kota Yogyakarta',
    ...over,
  } as workspaceRepo.MemberWithUser
}

function signedIn(role: MemberRole = 'owner', plan: 'free' | 'standard' | 'premium' = 'premium') {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER_ID }, session: { id: 's' } } as never)
  vi.spyOn(workspaceService, 'ensureWorkspace').mockResolvedValue({
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Dishub DIY',
    role,
  })
  vi.mocked(workspaceRepo.getPlan).mockResolvedValue(plan)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.mocked(workspaceRepo.listMembers).mockResolvedValue([member()])
  vi.mocked(workspaceRepo.countMembers).mockResolvedValue(1)
  vi.mocked(workspaceRepo.countByRole).mockResolvedValue(2)
  vi.mocked(workspaceRepo.findMemberByEmail).mockResolvedValue(undefined)
  vi.mocked(workspaceRepo.findMemberById).mockResolvedValue(member())
  vi.mocked(userRepo.findByEmail).mockResolvedValue(undefined)
})

describe('capability matrix', () => {
  it('matches what the Team screen renders', async () => {
    signedIn()
    const res = await request(app).get('/team/capabilities')

    // The UI shows this table to explain the roles. If it disagreed with the code
    // enforcing them, the product would be lying to the user about what they can do.
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(ROLE_CAPABILITIES)
    expect(res.body.data.read).toEqual({ viewer: true, editor: true, owner: true })
    expect(res.body.data.write).toEqual({ viewer: false, editor: true, owner: true })
    expect(res.body.data.manage).toEqual({ viewer: false, editor: false, owner: true })
  })
})

describe('GET /team', () => {
  it('returns members with the shape the screen expects', async () => {
    signedIn()
    const res = await request(app).get('/team')

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      email: 'siti@dishubjogja.go.id',
      name: 'Siti Aminah',
      unit: 'Dishub Kota Yogyakarta',
      role: 'editor',
      status: 'active',
      zones: 'all',
    })
  })

  it('falls back to the email local part for someone who has not signed up', async () => {
    signedIn()
    vi.mocked(workspaceRepo.listMembers).mockResolvedValue([
      member({ userId: null, status: 'invited', joinedAt: null, userName: null, userOrganisation: null }),
    ])

    const res = await request(app).get('/team')

    expect(res.body.data[0].name).toBe('siti')
    expect(res.body.data[0].status).toBe('invited')
    expect(res.body.data[0].lastSeen).toBe('Belum bergabung')
  })

  it('is readable by a Viewer', async () => {
    signedIn('viewer')
    expect((await request(app).get('/team')).status).toBe(200)
  })
})

describe('POST /team/invite', () => {
  const body = { email: 'baru@dishub.go.id', role: 'editor' }

  it('invites someone who has no account yet', async () => {
    signedIn()
    vi.mocked(workspaceRepo.addMember).mockResolvedValue(member({ status: 'invited', userId: null }) as never)
    vi.mocked(workspaceRepo.listMembers).mockResolvedValue([member({ status: 'invited', userId: null })])

    const res = await request(app).post('/team/invite').send(body)

    expect(res.status).toBe(201)
    expect(workspaceRepo.addMember).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'baru@dishub.go.id', status: 'invited', userId: null }),
    )
  })

  it('activates immediately when the address already has an account', async () => {
    signedIn()
    vi.mocked(userRepo.findByEmail).mockResolvedValue({ id: 'user_03' } as never)
    vi.mocked(workspaceRepo.addMember).mockResolvedValue(member() as never)

    await request(app).post('/team/invite').send(body)

    // A pending state nobody can act on would be worse — there are no invitation
    // emails yet, so the invite would just sit there.
    expect(workspaceRepo.addMember).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', userId: 'user_03' }),
    )
  })

  it('refuses an Editor trying to invite', async () => {
    signedIn('editor')

    const res = await request(app).post('/team/invite').send(body)

    expect(res.status).toBe(403)
    expect(workspaceRepo.addMember).not.toHaveBeenCalled()
  })

  it('refuses a duplicate address', async () => {
    signedIn()
    vi.mocked(workspaceRepo.findMemberByEmail).mockResolvedValue(member() as never)

    const res = await request(app).post('/team/invite').send(body)

    expect(res.status).toBe(422)
    expect(workspaceRepo.addMember).not.toHaveBeenCalled()
  })

  it('enforces the seat limit, counting pending invites', async () => {
    signedIn('owner', 'free') // free allows 1 seat
    vi.mocked(workspaceRepo.countMembers).mockResolvedValue(1)

    const res = await request(app).post('/team/invite').send(body)

    // The seat is reserved when the invitation goes out; otherwise a workspace could
    // invite past its limit and only find out when people accept.
    expect(res.status).toBe(422)
    expect(res.body.error.details).toMatchObject({ limit: 1, plan: 'free' })
    expect(workspaceRepo.addMember).not.toHaveBeenCalled()
  })

  it('refuses to invite straight to Owner', async () => {
    signedIn()

    const res = await request(app).post('/team/invite').send({ ...body, role: 'owner' })

    // Transferring ownership has different consequences (the current owner loses
    // billing control) and is not specced, so it is not silently allowed here.
    expect(res.status).toBe(422)
    expect(workspaceRepo.addMember).not.toHaveBeenCalled()
  })

  it('rejects a malformed address', async () => {
    signedIn()
    expect((await request(app).post('/team/invite').send({ email: 'nope', role: 'editor' })).status).toBe(422)
  })
})

describe('PATCH /team/:id/role', () => {
  it('changes a role', async () => {
    signedIn()
    vi.mocked(workspaceRepo.updateMember).mockResolvedValue(member({ role: 'viewer' }) as never)
    vi.mocked(workspaceRepo.listMembers).mockResolvedValue([member({ role: 'viewer' })])

    const res = await request(app).patch(`/team/${MEMBER_ID}/role`).send({ role: 'viewer' })

    expect(res.status).toBe(200)
    expect(workspaceRepo.updateMember).toHaveBeenCalledWith(MEMBER_ID, { role: 'viewer' })
  })

  it('refuses changing your own role', async () => {
    signedIn()
    vi.mocked(workspaceRepo.findMemberById).mockResolvedValue(member({ userId: USER_ID }) as never)

    const res = await request(app).patch(`/team/${MEMBER_ID}/role`).send({ role: 'viewer' })

    expect(res.status).toBe(403)
    expect(workspaceRepo.updateMember).not.toHaveBeenCalled()
  })

  it('refuses to demote the last Owner', async () => {
    signedIn()
    vi.mocked(workspaceRepo.findMemberById).mockResolvedValue(member({ role: 'owner' }) as never)
    vi.mocked(workspaceRepo.countByRole).mockResolvedValue(1)

    const res = await request(app).patch(`/team/${MEMBER_ID}/role`).send({ role: 'viewer' })

    // A workspace with no owner cannot invite anyone or change its plan, and there
    // is no API path back.
    expect(res.status).toBe(422)
    expect(workspaceRepo.updateMember).not.toHaveBeenCalled()
  })

  it('refuses an Editor trying to change roles', async () => {
    signedIn('editor')
    expect((await request(app).patch(`/team/${MEMBER_ID}/role`).send({ role: 'viewer' })).status).toBe(403)
  })

  it('refuses a member from another workspace', async () => {
    signedIn()
    vi.mocked(workspaceRepo.findMemberById).mockResolvedValue(member({ workspaceId: 'other' }) as never)

    expect((await request(app).patch(`/team/${MEMBER_ID}/role`).send({ role: 'viewer' })).status).toBe(404)
  })
})

describe('DELETE /team/:id', () => {
  it('removes a member', async () => {
    signedIn()

    const res = await request(app).delete(`/team/${MEMBER_ID}`)

    expect(res.status).toBe(200)
    expect(workspaceRepo.removeMember).toHaveBeenCalledWith(MEMBER_ID)
  })

  it('refuses removing yourself', async () => {
    signedIn()
    vi.mocked(workspaceRepo.findMemberById).mockResolvedValue(member({ userId: USER_ID }) as never)

    expect((await request(app).delete(`/team/${MEMBER_ID}`)).status).toBe(403)
    expect(workspaceRepo.removeMember).not.toHaveBeenCalled()
  })

  it('refuses removing the last Owner', async () => {
    signedIn()
    vi.mocked(workspaceRepo.findMemberById).mockResolvedValue(member({ role: 'owner' }) as never)
    vi.mocked(workspaceRepo.countByRole).mockResolvedValue(1)

    expect((await request(app).delete(`/team/${MEMBER_ID}`)).status).toBe(422)
    expect(workspaceRepo.removeMember).not.toHaveBeenCalled()
  })
})

describe('workspaces', () => {
  it('lists the workspaces a user belongs to', async () => {
    signedIn()
    vi.spyOn(workspaceService, 'listWorkspaces').mockResolvedValue([
      { id: WORKSPACE_ID, name: 'Dishub DIY', role: 'owner', plan: 'premium' },
    ])

    const res = await request(app).get('/workspaces')

    expect(res.status).toBe(200)
    expect(res.body.data.activeWorkspaceId).toBe(WORKSPACE_ID)
    expect(res.body.data.workspaces).toHaveLength(1)
  })

  it('refuses switching to a workspace you do not belong to', async () => {
    signedIn()
    vi.mocked(workspaceRepo.findMembership).mockResolvedValue(undefined)

    const res = await request(app)
      .post('/workspaces/switch')
      .send({ workspaceId: 'ffffffff-2222-4222-8222-222222222222' })

    // 404, not 403 — telling someone a workspace exists but is not theirs leaks
    // that it exists at all.
    expect(res.status).toBe(404)
  })
})
