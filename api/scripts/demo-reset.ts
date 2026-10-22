/**
 * `npm run demo:reset` — deletes the demo account (DEMO_EMAIL) and builds it again now,
 * the same reset demo.sweeper runs after 00:00 WIB. Everything the account holds is
 * deleted and every visitor signed in to it is signed out. Inside the container:
 * `docker compose exec api npm run demo:reset`.
 */
import { config } from '../src/config/env'
import { resetDemoAccount } from '../src/services/demo.service'

async function main() {
  if (!config.demoEnabled) {
    console.log('DEMO_ENABLED is off — nothing to reset.')
    process.exit(0)
  }
  const r = await resetDemoAccount()
  console.log(`${r.replaced ? 'Reset' : 'Created'} ${config.demoEmail} (Premium, verified)`)
  console.log(`  ${r.seededCaptures} sample captures${r.sampleDay ? ` from ${r.sampleDay} (WIB)` : ''}`)
  console.log(`  ${r.filesRemoved} old files removed from R2`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
