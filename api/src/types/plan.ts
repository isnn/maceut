/**
 * Plan catalogue — the backend's copy of `web/src/lib/constants.ts`.
 *
 * These two must stay in step: the frontend renders limits from its copy and the
 * backend enforces them from this one (BR-007 puts enforcement in the service layer).
 * When a limit changes, both files change, and so does product.md's BR-005/BR-006.
 */

export type Plan = 'free' | 'standard' | 'premium'

export const PLANS: readonly Plan[] = ['free', 'standard', 'premium'] as const

/** BR-020/021/022. Ordered: `nasional` < `nasional_provinsi` < `semua`. */
export type RoadClass = 'nasional' | 'nasional_provinsi' | 'semua'

export const ROAD_CLASS_ORDER: readonly RoadClass[] = ['nasional', 'nasional_provinsi', 'semua'] as const

/** HERE functional classes each road class resolves to (BR-001..003). */
export const ROAD_CLASS_FC: Record<RoadClass, readonly string[]> = {
  nasional: ['FC1', 'FC2'],
  nasional_provinsi: ['FC1', 'FC2', 'FC3'],
  semua: ['FC1', 'FC2', 'FC3', 'FC4', 'FC5'],
}

export interface PlanLimits {
  maxRoadClass: RoadClass
  /** BR-005 */
  schedulesLimit: number
  /** BR-006 */
  capturesLimit: number
  zonesLimit: number
  seatsLimit: number
  storageGb: number
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { maxRoadClass: 'nasional', schedulesLimit: 10, capturesLimit: 10, zonesLimit: 1, seatsLimit: 1, storageGb: 1 },
  standard: {
    maxRoadClass: 'nasional_provinsi',
    schedulesLimit: 20,
    capturesLimit: 50,
    zonesLimit: 5,
    seatsLimit: 5,
    storageGb: 10,
  },
  premium: { maxRoadClass: 'semua', schedulesLimit: 50, capturesLimit: 100, zonesLimit: 25, seatsLimit: 25, storageGb: 100 },
}

export function roadClassRank(rc: RoadClass): number {
  return ROAD_CLASS_ORDER.indexOf(rc)
}

/** BR-021 — may this plan create a zone at this road class? */
export function isRoadClassAllowed(plan: Plan, requested: RoadClass): boolean {
  return roadClassRank(requested) <= roadClassRank(PLAN_LIMITS[plan].maxRoadClass)
}

/**
 * BR-022 — what actually gets captured: MIN(zone's stored class, plan's maximum).
 * A zone keeps the class it was created with even after a downgrade; only the
 * capture is capped, so an upgrade restores the original depth without an edit.
 */
export function effectiveRoadClass(zoneRoadClass: RoadClass, plan: Plan): RoadClass {
  const max = PLAN_LIMITS[plan].maxRoadClass
  return roadClassRank(zoneRoadClass) <= roadClassRank(max) ? zoneRoadClass : max
}

/** Platform role — distinct from workspace/team role (specs/internal, BR-027). */
export type PlatformRole = 'user' | 'internal'
