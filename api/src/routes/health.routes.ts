import { Router } from 'express'
import * as healthController from '../controllers/health.controller'

const router = Router()

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Status service dan dependency-nya
 *     description: >
 *       Mengembalikan 200 jika database dan RabbitMQ tersambung, 503 jika salah satu
 *       tidak. R2 dan HERE ikut dilaporkan tapi tidak mempengaruhi status code —
 *       keduanya opsional saat boot.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Semua dependency wajib tersambung
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: ok }
 *                     env: { type: string, example: development }
 *                     db:
 *                       type: object
 *                       properties:
 *                         connected: { type: boolean, example: true }
 *                         version: { type: string, example: PostgreSQL 16.4 }
 *                         postgis: { type: string, example: '3.4.2' }
 *                     queue:
 *                       type: object
 *                       properties:
 *                         connected: { type: boolean, example: true }
 *                     integrations:
 *                       type: object
 *                       properties:
 *                         r2: { type: string, example: configured }
 *                         here: { type: string, example: not_configured }
 *       503:
 *         description: Database atau RabbitMQ tidak tersambung
 */
router.get('/health', healthController.health)

export default router
