/**
 * `npm run retention:dry-run` — what the capture retention sweeper would change now (H1,
 * ADR-035). READ-ONLY: it counts and writes nothing. Run it inside the container against
 * the real data before setting RETENTION_SWEEPER_ENABLED=true:
 * `docker compose exec api npm run retention:dry-run`.
 */
import * as captureRepo from '../src/repositories/capture.repository'
import { cutoffs, HARD_DELETE_AFTER_DAYS, SOFT_DELETE_AFTER_DAYS } from '../src/schedulers/retention.sweeper'
import { config } from '../src/config/env'

async function main() {
  const { softBefore, purgeBefore } = cutoffs()
  const c = await captureRepo.retentionCounts(softBefore, purgeBefore)

  console.log('Capture retention — dry run (read-only, nothing changed)\n')
  console.log(`  Soft delete: captured before ${softBefore.toISOString()} (${SOFT_DELETE_AFTER_DAYS} days)`)
  console.log(`    ${c.toSoftDelete} captures would be hidden; ${c.toSoftDeleteWithTraffic} of them still hold HERE traffic to erase`)
  console.log(`  Hard delete: captured before ${purgeBefore.toISOString()} (${HARD_DELETE_AFTER_DAYS} days)`)
  console.log(`    ${c.toPurge} capture rows would be deleted; ${c.toPurgeWithImage} image files (+ thumbnails) removed from R2`)
  console.log(`\nSweeper is ${config.retentionSweeperEnabled ? 'ON' : 'OFF'} (RETENTION_SWEEPER_ENABLED).`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
