import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as exportService from '../services/export.service'
import { createExportSchema } from '../schemas/export.schema'
import { UnauthorizedError } from '../errors'
import { ok } from '../types/api'

const idParam = z.string().uuid('Id tidak valid.')

/**
 * Queue a Studio export (FE-21). 202: the row exists and is queued, but the file is
 * minutes away — the response carries the export so the caller can poll it.
 */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId || !req.plan) throw new UnauthorizedError()
    const zoneId = idParam.parse(req.params.id)
    const input = createExportSchema.parse(req.body)
    return res.status(202).json(ok(await exportService.createExport(req.userId, req.plan, zoneId, input)))
  } catch (err) {
    next(err)
  }
}

/** A zone's exports, newest first. */
export async function listForZone(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const zoneId = idParam.parse(req.params.id)
    return res.status(200).json(ok(await exportService.listForZone(req.userId, zoneId)))
  } catch (err) {
    next(err)
  }
}

/** One export — polled while it renders. */
export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const id = idParam.parse(req.params.id)
    return res.status(200).json(ok(await exportService.getExport(req.userId, id)))
  } catch (err) {
    next(err)
  }
}

/** Cancel an export in progress, or delete a finished one with its file. */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw new UnauthorizedError()
    const id = idParam.parse(req.params.id)
    return res.status(200).json(ok(await exportService.removeExport(req.userId, id)))
  } catch (err) {
    next(err)
  }
}

/** Re-queue a finished, failed or expired export with the same settings and frames. */
export async function retry(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId || !req.plan) throw new UnauthorizedError()
    const id = idParam.parse(req.params.id)
    return res.status(202).json(ok(await exportService.retryExport(req.userId, req.plan, id)))
  } catch (err) {
    next(err)
  }
}
