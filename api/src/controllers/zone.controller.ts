import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as zoneService from '../services/zone.service'
import { createZoneSchema, updateZoneSchema } from '../schemas/zone.schema'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'
import type { Plan } from '../types/plan'

const zoneIdParam = z.string().uuid('Id zona tidak valid.')

/** Thin: parse, call the service, format. Rules live in the service (BR-007). */

function requireContext(req: Request): { userId: string; workspaceId: string; plan: Plan } {
  if (!req.userId || !req.workspaceId) throw new UnauthorizedError()
  // workspaceContext runs before every route here, so plan is set. Defaulting to free
  // rather than asserting keeps a middleware-ordering mistake from becoming a crash —
  // and free is the safe direction to fail in.
  return { userId: req.userId, workspaceId: req.workspaceId, plan: req.plan ?? 'free' }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = requireContext(req)
    return res.status(200).json(ok(await zoneService.getZonesForWorkspace(workspaceId)))
  } catch (err) {
    next(err)
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = requireContext(req)
    const id = zoneIdParam.parse(req.params.id)
    return res.status(200).json(ok(await zoneService.getZone(workspaceId, id)))
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, workspaceId, plan } = requireContext(req)
    const input = createZoneSchema.parse(req.body)
    return res.status(201).json(ok(await zoneService.createZone(workspaceId, userId, plan, input)))
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId, plan } = requireContext(req)
    const id = zoneIdParam.parse(req.params.id)
    const patch = updateZoneSchema.parse(req.body)
    return res.status(200).json(ok(await zoneService.updateZone(workspaceId, id, plan, patch)))
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = requireContext(req)
    const id = zoneIdParam.parse(req.params.id)
    await zoneService.deleteZone(workspaceId, id)
    return res.status(200).json(ok({ deleted: true }))
  } catch (err) {
    next(err)
  }
}
