import { Router } from 'express'
import healthRoutes from './health.routes'
import meRoutes from './me.routes'
import userRoutes from './user.routes'
import zoneRoutes from './zone.routes'
import scheduleRoutes from './schedule.routes'
import exportRoutes from './export.routes'
import hereUsageRoutes from './here-usage.routes'
import notificationRoutes from './notification.routes'

// Note: sign-up, sign-in and sign-out are NOT here. Better Auth serves them under
// /api/auth/* and is mounted directly in app.ts, ahead of the body parser (ADR-009).
const router = Router()

router.use(healthRoutes)
router.use(meRoutes)
router.use(userRoutes)
router.use(zoneRoutes)
router.use(scheduleRoutes)
router.use(exportRoutes)
router.use(hereUsageRoutes)
router.use(notificationRoutes)

export default router
