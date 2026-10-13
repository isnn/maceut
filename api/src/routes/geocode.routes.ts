import { Router } from 'express'
import * as geocodeController from '../controllers/geocode.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { previewRateLimit } from '../middlewares/rate-limit.middleware'

const router = Router()

router.use('/geocode', authMiddleware)

/**
 * @swagger
 * /geocode:
 *   get:
 *     summary: Cari tempat untuk peta pembuatan zona
 *     description: >
 *       HERE Geocoding selama pencarian HERE bulan ini (WIB) di bawah
 *       HERE_GEOCODE_MONTHLY_LIMIT (default 4.000), lalu OpenStreetMap Nominatim. HERE
 *       gagal atau tanpa kunci juga jatuh ke Nominatim. Hasil sama di-cache 24 jam.
 *       Seluruh dunia, tempat di Indonesia didahulukan; maksimal 5 hasil.
 *     tags: [Zones]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2, maxLength: 120, example: Malioboro Yogyakarta }
 *     responses:
 *       200:
 *         description: Hasil pencarian
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     provider: { type: string, enum: [here, osm] }
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           label: { type: string }
 *                           lat: { type: number }
 *                           lng: { type: number }
 *                           bbox: { type: array, nullable: true, items: { type: number }, description: '[west, south, east, north]' }
 *                           countryCode: { type: string, nullable: true, example: id, description: ISO 3166 alpha-2 huruf kecil }
 *       401: { description: UNAUTHORIZED }
 *       422: { description: VALIDATION_ERROR }
 *       429: { description: 'RATE_LIMITED — terlalu banyak pratinjau/pencarian dari akun ini (bersama /traffic/preview & /traffic/road-class-counts); lihat header Retry-After' }
 *       502: { description: UPSTREAM_ERROR — HERE dan OpenStreetMap sama-sama gagal }
 */
router.get('/geocode', previewRateLimit, geocodeController.search)

export default router
