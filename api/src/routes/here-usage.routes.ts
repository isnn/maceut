import { Router } from 'express'
import * as hereUsageController from '../controllers/here-usage.controller'
import { authMiddleware, internalOnly } from '../middlewares/auth.middleware'

const router = Router()

// Staff only. user.routes.ts guards `/internal` too, but a route must never depend on
// another file's guard (that is how `/captures/:id` once shipped unauthenticated).
router.use('/internal/here-usage', authMiddleware, internalOnly)

/**
 * @swagger
 * /internal/here-usage:
 *   get:
 *     summary: Pemakaian HERE Traffic & batas anggaran (staf saja)
 *     description: >
 *       Jumlah request ke HERE per hari WIB dan per sumber (capture, preview,
 *       road_counts, zone_stats), total bulan berjalan, bagian batas yang terpakai, dan
 *       riwayat 30 hari. `refused` = panggilan yang ditolak batas sebelum dikirim (tidak
 *       ditagih, tapi berarti capture/preview yang tidak terjadi).
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Ringkasan pemakaian }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN — bukan staf }
 *   put:
 *     summary: Atur batas harian/bulanan request HERE (staf saja)
 *     description: >
 *       null = tanpa batas. Saat batas tercapai, panggilan HERE ditolak sebelum dikirim;
 *       pelanggan hanya melihat "data lalu lintas sedang tidak tersedia" (503
 *       TRAFFIC_UNAVAILABLE). Berlaku seketika di API, dan dalam ±15 detik di worker.
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dailyLimit, monthlyLimit, costPer1000]
 *             properties:
 *               dailyLimit: { type: integer, nullable: true }
 *               monthlyLimit: { type: integer, nullable: true }
 *               costPer1000: { type: number, nullable: true, description: Harga per 1.000 request, hanya untuk estimasi biaya }
 *     responses:
 *       200: { description: Ringkasan pemakaian dengan batas baru }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN — bukan staf }
 *       422: { description: VALIDATION_ERROR }
 */
router.get('/internal/here-usage', hereUsageController.summary)
router.put('/internal/here-usage', hereUsageController.updateBudget)

export default router
