import { Router } from 'express'
import healthRoutes from './health.routes'
import meRoutes from './me.routes'
import userRoutes from './user.routes'

// Note: sign-up, sign-in and sign-out are NOT here. Better Auth serves them under
// /api/auth/* and is mounted directly in app.ts, ahead of the body parser (ADR-009).
const router = Router()

router.use(healthRoutes)
router.use(meRoutes)
router.use(userRoutes)

export default router
