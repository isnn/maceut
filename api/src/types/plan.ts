/**
 * Plan catalogue — the backend's copy of `web/src/lib/constants.ts`.
 *
 * These two must stay in step: the frontend renders limits from its copy and the
 * backend enforces them from this one (BR-007 puts enforcement in the service layer).
 * When a limit changes, both files change, and so does product.md's BR-005/BR-006.
 */

export type Plan = 'free' | 'standard' | 'premium'

export const PLANS: readonly Plan[] = ['free', 'standard', 'premium'] as const

/**
 * Cheapest to dearest, so "is this an upgrade?" is a comparison rather than a chain of
 * `if`s that has to be re-read every time a plan is added.
 */
export function planRank(plan: Plan): number {
  return PLANS.indexOf(plan)
}

/** True when moving `from` → `to` gains capacity, i.e. costs money once billing exists. */
export function isUpgrade(from: Plan, to: Plan): boolean {
  return planRank(to) > planRank(from)
}

/** BR-020/021/022. Ordered: `nasional` < `nasional_provinsi` < `semua`. */
export type RoadClass = 'nasional' | 'nasional_provinsi' | 'semua'

export const ROAD_CLASS_ORDER: readonly RoadClass[] = ['nasional', 'nasional_provinsi', 'semua'] as const

/**
 * HERE functional classes each road class resolves to (BR-001..003).
 *
 * The mapping, against HERE's own definitions:
 *
 *   FC1  controlled access, high volume at maximum speed between and through major
 *        metropolitan areas            → jalan tol, arteri primer
 *   FC2  channels traffic to FC1, travel between and through cities in the shortest
 *        time                          → arteri primer non-tol
 *        ⇒ FC1 + FC2 ≈ **Jalan Nasional**
 *   FC3  interconnects with FC2, high volume at lower mobility
 *        ⇒ ≈ **Jalan Provinsi** (kolektor primer)
 *   FC4  high volume at moderate speed between neighbourhoods
 *   FC5  volume and movement below any other road
 *        ⇒ FC4 + FC5 ≈ **Jalan Kabupaten/Kota** and jalan lingkungan
 *
 * ⚠️ This is an approximation, and knowingly so. Indonesia classifies roads by
 * administrative status (UU 38/2004 — who owns and funds them); HERE classifies by
 * traffic *function*. They mostly line up, but not always: a Jalan Nasional through a
 * quiet district may be FC3, and a busy city street like Jalan Jenderal Sudirman can
 * be FC2 despite being a city road. The tier therefore sells "depth of road data",
 * not "legally classified as national" — which is how the product describes it, and
 * the honest reading.
 *
 * Verified against HERE's docs on 2026-09-20. FC is a *request* filter: the flow
 * response does not carry a functional class per segment, so filtering can only be
 * done upstream — see here-traffic-client.ts.
 */
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

/** Platform role: `user` = paying customer, `internal` = Maceut staff (BR-027). */
export type PlatformRole = 'user' | 'internal'
