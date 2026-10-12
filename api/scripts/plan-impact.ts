/**
 * `npm run plan:impact` — which accounts the new plan catalog would pause. READ-ONLY.
 *
 * The delivery doc lowers some limits on existing plans (Free windows 10 → 3, Premium
 * zones 25 → 15, windows 50 → 45). An account already over a new limit keeps working
 * until someone applies the change; the rule for that is ADR-020's pause, never delete,
 * after the account has been told.
 *
 * This runs the same `previewPlanChange` the plan-change dialog uses, against each
 * account's CURRENT plan, so what it reports is exactly what applying the catalog would
 * pause. It writes nothing. Run it inside the container:
 * `docker compose exec api npm run plan:impact`.
 */
import { configuredInternalEmails } from '../src/lib/internal-access'
import * as userRepo from '../src/repositories/user.repository'
import { previewPlanChange } from '../src/services/plan.service'
import { PLANS, type Plan } from '../src/types/plan'

async function main() {
  const { rows } = await userRepo.listWithPlans({
    internalEmails: configuredInternalEmails(),
    limit: 10_000,
    offset: 0,
  })

  const byPlan = Object.fromEntries(PLANS.map((p) => [p, { accounts: 0, affected: 0 }])) as Record<
    Plan,
    { accounts: number; affected: number }
  >
  const affected: string[] = []

  for (const row of rows) {
    const plan = row.plan
    byPlan[plan].accounts += 1
    const impact = await previewPlanChange(row.id, plan)
    if (impact.clean) continue
    byPlan[plan].affected += 1
    const reasons = [...impact.zonesToPause, ...impact.schedulesToPause].map((i) => i.reason)
    const counts = [...new Set(reasons)].map((r) => `${r} ×${reasons.filter((x) => x === r).length}`)
    affected.push(`  ${plan.padEnd(8)} ${row.email}  zones ${impact.zonesToPause.length}, windows ${impact.schedulesToPause.length}  (${counts.join(', ')})`)
  }

  console.log('Plan catalog impact (read-only, nothing changed)\n')
  for (const p of PLANS) console.log(`  ${p.padEnd(8)} ${byPlan[p].accounts} accounts, ${byPlan[p].affected} over the new limits`)
  console.log(affected.length > 0 ? `\nAccounts that would be paused:\n${affected.join('\n')}` : '\nNo account is over the new limits.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
