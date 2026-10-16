import { desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../lib/drizzle-client'
import { planChanges, user } from '../../drizzle/schema'
import type { Plan } from '../types/plan'

export interface PlanChangeInput {
  userId: string
  fromPlan: Plan | null
  toPlan: Plan
  source: 'self' | 'staff'
  changedBy?: string | null
}

export interface PlanChangeRecord {
  id: string
  fromPlan: Plan | null
  toPlan: Plan
  source: 'self' | 'staff'
  /** The staff member's name or email (kept after their account is deleted); null for a self-serve change. */
  changedBy: string | null
  createdAt: Date
}

/**
 * Stores the emails alongside the ids: a deleted account (customer or staff) nulls the
 * id, and the row still has to say whose plan it was and who changed it.
 */
export async function record(input: PlanChangeInput): Promise<void> {
  const ids = [input.userId, ...(input.changedBy ? [input.changedBy] : [])]
  const rows = await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, ids))
  const emailOf = new Map(rows.map((r) => [r.id, r.email]))
  await db.insert(planChanges).values({
    userId: input.userId,
    userEmail: emailOf.get(input.userId) ?? '',
    fromPlan: input.fromPlan,
    toPlan: input.toPlan,
    source: input.source,
    changedBy: input.changedBy ?? null,
    changedByEmail: input.changedBy ? (emailOf.get(input.changedBy) ?? null) : null,
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
      changedByEmail: planChanges.changedByEmail,
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
    changedBy: r.actorName || r.actorEmail || r.changedByEmail || null,
    createdAt: r.createdAt,
  }))
}
