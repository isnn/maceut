import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as scheduleService from '../services/schedule.service'
import { createScheduleSchema, updateScheduleSchema } from '../schemas/schedule.schema'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'
import type { Plan } from '../types/plan'
import type { CaptureInterval } from '../types/schedule'

const scheduleIdParam = z.string().uuid('Id jadwal tidak valid.')

/** Thin: parse, call the service, format. Rules live in the service (BR-007). */
function requireContext(req: Request): { userId: string; workspaceId: string; plan: Plan } {
  if (!req.userId || !req.workspaceId) throw new UnauthorizedError()
  return { userId: req.userId, workspaceId: req.workspaceId, plan: req.plan ?? 'free' }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = requireContext(req)
    const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined

    const data = zoneId
      ? await scheduleService.listForZone(workspaceId, zoneId)
      : await scheduleService.listSchedules(workspaceId)

    return res.status(200).json(ok(data))
  } catch (err) {
    next(err)
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, workspaceId, plan } = requireContext(req)
    const input = createScheduleSchema.parse(req.body)

    return res.status(201).json(
      ok(
        await scheduleService.createSchedule(workspaceId, userId, plan, {
          ...input,
          interval: input.interval as CaptureInterval,
        }),
      ),
    )
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId, plan } = requireContext(req)
    const id = scheduleIdParam.parse(req.params.id)
    const patch = updateScheduleSchema.parse(req.body)

    return res.status(200).json(
      ok(
        await scheduleService.updateSchedule(workspaceId, id, plan, {
          ...patch,
          interval: patch.interval as CaptureInterval | undefined,
        }),
      ),
    )
  } catch (err) {
    next(err)
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = requireContext(req)
    const id = scheduleIdParam.parse(req.params.id)
    await scheduleService.deleteSchedule(workspaceId, id)
    return res.status(200).json(ok({ deleted: true }))
  } catch (err) {
    next(err)
  }
}

/** Budget readout for the Schedule board header. */
export async function stats(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId, plan } = requireContext(req)
    const framesPerDay = await scheduleService.totalFramesPerDay(workspaceId)
    const schedules = await scheduleService.listSchedules(workspaceId)

    return res.status(200).json(
      ok({
        framesPerDay,
        activeCount: schedules.filter((s) => s.active).length,
        totalCount: schedules.length,
        plan,
      }),
    )
  } catch (err) {
    next(err)
  }
}
