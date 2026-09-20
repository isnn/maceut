import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as workspaceService from '../services/workspace.service'
import { inviteMemberSchema, changeMemberRoleSchema, switchWorkspaceSchema } from '../schemas/schedule.schema'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'
import { ROLE_CAPABILITIES, type MemberRole } from '../types/workspace'

const memberIdParam = z.string().uuid('Id anggota tidak valid.')

function requireContext(req: Request): { userId: string; workspaceId: string; role: MemberRole } {
  if (!req.userId || !req.workspaceId || !req.memberRole) throw new UnauthorizedError()
  return { userId: req.userId, workspaceId: req.workspaceId, role: req.memberRole }
}

export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, workspaceId } = requireContext(req)
    return res.status(200).json(ok(await workspaceService.listMembers(workspaceId, userId)))
  } catch (err) {
    next(err)
  }
}

export async function invite(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId, role } = requireContext(req)
    const input = inviteMemberSchema.parse(req.body)

    return res
      .status(201)
      .json(ok(await workspaceService.inviteMember(workspaceId, role, { ...input, role: input.role as MemberRole })))
  } catch (err) {
    next(err)
  }
}

export async function changeRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, workspaceId, role } = requireContext(req)
    const memberId = memberIdParam.parse(req.params.id)
    const input = changeMemberRoleSchema.parse(req.body)

    return res
      .status(200)
      .json(ok(await workspaceService.changeMemberRole(workspaceId, userId, role, memberId, input.role as MemberRole)))
  } catch (err) {
    next(err)
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, workspaceId, role } = requireContext(req)
    const memberId = memberIdParam.parse(req.params.id)

    await workspaceService.removeMember(workspaceId, userId, role, memberId)
    return res.status(200).json(ok({ removed: true }))
  } catch (err) {
    next(err)
  }
}

/**
 * The capability matrix the Team screen renders under the member table.
 *
 * Served rather than duplicated in the frontend so the table explaining the roles and
 * the code enforcing them cannot drift apart — a UI that promises an Editor can do
 * something the API refuses is worse than no table at all.
 */
export async function capabilities(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(ok(ROLE_CAPABILITIES))
  } catch (err) {
    next(err)
  }
}

// --- Workspaces ----------------------------------------------------------------

export async function listWorkspaces(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    return res.status(200).json(
      ok({
        workspaces: await workspaceService.listWorkspaces(req.userId),
        activeWorkspaceId: req.workspaceId,
      }),
    )
  } catch (err) {
    next(err)
  }
}

export async function switchWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const { workspaceId } = switchWorkspaceSchema.parse(req.body)
    return res.status(200).json(ok(await workspaceService.switchWorkspace(req.userId, workspaceId)))
  } catch (err) {
    next(err)
  }
}
