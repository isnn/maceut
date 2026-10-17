import { desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../lib/drizzle-client'
import { planChanges, planChangeSourceEnum, user } from '../../drizzle/schema'
import type { Plan } from '../types/plan'

/** self = the customer, staff = /internal, payment = a paid Midtrans order, expiry = a paid period ran out. */
export type PlanChangeSource = (typeof planChangeSourceEnum.enumValues)[number]

export interface PlanChangeInput {
  userId: string
  fromPlan: Plan | null
  toPlan: Plan
  source: PlanChangeSource
  changedBy?: string | null
}

export interface PlanChangeRecord {
  id: string
  fromPlan: Plan | null
  toPlan: Plan
  source: PlanChangeSource
  /** The staff member's name or email; null for a self-serve change or a deleted account. */
  changedBy: string | null
  createdAt: Date
}

export async function record(input: PlanChangeInput): Promise<void> {
  await db.insert(planChanges).values({
    userId: input.userId,
    fromPlan: input.fromPlan,
    toPlan: input.toPlan,
    source: input.source,
    changedBy: input.changedBy ?? null,
  })
}

const actor = alias(user, 'actor')

/** Newest first. */
export async function listByUser(userId: string, limit = 50): Promise<PlanChangeRecord[]> {
  const rows = await db
    .select({
      id: planChanges.id,
      fromPlan: planChanges.fromPlan,
      toPlan: planChanges.toPlan,
      source: planChanges.source,
      actorName: actor.name,
      actorEmail: actor.email,
      createdAt: planChanges.createdAt,
    })
    .from(planChanges)
    .leftJoin(actor, eq(actor.id, planChanges.changedBy))
    .where(eq(planChanges.userId, userId))
    .orderBy(desc(planChanges.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    fromPlan: r.fromPlan,
    toPlan: r.toPlan,
    source: r.source,
    changedBy: r.actorName || r.actorEmail || null,
    createdAt: r.createdAt,
  }))
}
