import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as zoneService from '../services/zone.service'
import { createZoneSchema, updateZoneSchema } from '../schemas/zone.schema'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'
import type { Plan } from '../types/plan'

const zoneIdParam = z.string().uuid('Id zona tidak valid.')

/** Thin: parse, call the service, format. Rules live in the service (BR-007). */

function requireAuth(req: Request): { userId: string; plan: Plan } {
  if (!req.userId) throw new UnauthorizedError()
  // planCheck middleware runs before every route here, so plan is set. Defaulting to
  // free rather than asserting keeps a middleware ordering mistake from becoming a
  // crash — and free is the safe direction to fail in.
  return { userId: req.userId, plan: req.plan ?? 'free' }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireAuth(req)
    return res.status(200).json(ok(await zoneService.getZonesForUser(userId)))
  } catch (err) {
    next(err)
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireAuth(req)
    const id = zoneIdParam.parse(req.params.id)
    return res.status(200).json(ok(await zoneService.getZone(userId, id)))
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, plan } = requireAuth(req)
    const input = createZoneSchema.parse(req.body)
    return res.status(201).json(ok(await zoneService.createZone(userId, plan, input)))
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, plan } = requireAuth(req)
    const id = zoneIdParam.parse(req.params.id)
    const patch = updateZoneSchema.parse(req.body)
    return res.status(200).json(ok(await zoneService.updateZone(userId, id, plan, patch)))
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireAuth(req)
    const id = zoneIdParam.parse(req.params.id)
    await zoneService.deleteZone(userId, id)
    return res.status(200).json(ok({ deleted: true }))
  } catch (err) {
    next(err)
  }
}
