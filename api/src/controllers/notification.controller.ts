import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as notificationService from '../services/notification.service'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'

const idParam = z.string().uuid('Id tidak valid.')

export const preferencesSchema = z.object({
  emailCaptureProblems: z.boolean({ required_error: 'emailCaptureProblems wajib diisi.' }),
})

/** The bell: latest notifications and how many are unread (NOTIF). */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const limit = z.coerce.number().int().positive().max(50).default(20).parse(req.query.limit)
    return res.status(200).json(ok(await notificationService.listForUser(req.userId, limit)))
  } catch (err) {
    next(err)
  }
}

export async function read(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    await notificationService.markRead(req.userId, idParam.parse(req.params.id))
    return res.status(200).json(ok({ read: true }))
  } catch (err) {
    next(err)
  }
}

export async function readAll(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    return res.status(200).json(ok(await notificationService.markAllRead(req.userId)))
  } catch (err) {
    next(err)
  }
}

export async function getPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    return res.status(200).json(ok(await notificationService.getPreferences(req.userId)))
  } catch (err) {
    next(err)
  }
}

export async function updatePreferences(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const prefs = preferencesSchema.parse(req.body)
    return res.status(200).json(ok(await notificationService.updatePreferences(req.userId, prefs)))
  } catch (err) {
    next(err)
  }
}
