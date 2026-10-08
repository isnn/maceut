import { Router } from 'express'
import * as exportController from '../controllers/export.controller'
import { authMiddleware, planCheck } from '../middlewares/auth.middleware'

const router = Router()

/**
 * ⚠️ This list is the guard — see the same warning in zone.routes.ts. A path missing
 * from it is an unauthenticated route, and nothing fails loudly.
 *
 * `/zones/:id/exports` is listed here even though zone.routes.ts's `/zones/:id` prefix
 * already covers it for requests that pass through that router first: relying on
 * another file's guard is exactly how `/captures/:id` shipped unauthenticated. The
 * cost is a second session lookup on those two routes.
 */
router.use(['/zones/:id/exports', '/exports', '/exports/:id', '/exports/:id/retry'], authMiddleware, planCheck)

/**
 * @swagger
 * components:
 *   schemas:
 *     Export:
 *       type: object
 *       description: >
 *         A Studio export rendered by the worker (FE-21). The row is the single source
 *         of truth for progress; `progress`, `queuePosition`, `etaSeconds` and
 *         `downloadUrl` are derived from it at read time.
 *       properties:
 *         id: { type: string, format: uuid }
 *         zoneId: { type: string, format: uuid }
 *         format: { type: string, enum: [zip, webm] }
 *         status: { type: string, enum: [queued, rendering, uploading, done, failed, expired] }
 *         frameCount: { type: integer }
 *         framesDone: { type: integer }
 *         progress: { type: number, minimum: 0, maximum: 1 }
 *         width: { type: integer }
 *         height: { type: integer }
 *         range:
 *           type: object
 *           properties:
 *             from: { type: string, format: date-time }
 *             to: { type: string, format: date-time }
 *         fileSize: { type: integer, nullable: true }
 *         error: { type: string, nullable: true }
 *         queuePosition: { type: integer, nullable: true, description: Export di depan dalam antrian (hanya saat queued) }
 *         etaSeconds: { type: integer, nullable: true, description: Perkiraan sisa detik (hanya saat rendering) }
 *         downloadUrl: { type: string, nullable: true, description: Link R2 bertanda tangan, berlaku 15 menit (hanya saat done) }
 *         createdAt: { type: string, format: date-time }
 *         startedAt: { type: string, format: date-time, nullable: true }
 *         finishedAt: { type: string, format: date-time, nullable: true }
 *         expiresAt: { type: string, format: date-time, nullable: true }
 */

/**
 * @swagger
 * /zones/{id}/exports:
 *   post:
 *     summary: Antrekan export Studio — ZIP frame atau animasi WebM (FE-21)
 *     description: >
 *       202: barisnya sudah ada dan diantre, tapi file-nya masih beberapa menit lagi.
 *       Render dilakukan worker memakai renderer Studio yang sama, jadi file-nya sama
 *       dengan preview. Rentang ditentukan oleh dua id capture; daftar frame dibekukan
 *       saat permintaan dibuat. Satu export aktif per akun; jumlah frame dibatasi paket
 *       (free 60, standard 240, premium 720).
 *     tags: [Exports]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [format, startCaptureId, endCaptureId, spec]
 *             properties:
 *               format: { type: string, enum: [zip, webm] }
 *               startCaptureId: { type: string, format: uuid }
 *               endCaptureId: { type: string, format: uuid }
 *               spec:
 *                 type: object
 *                 description: Pengaturan render Studio (tema per id, overlay, view, ukuran, holdMs)
 *     responses:
 *       202:
 *         description: Export diantre
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Export' }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: "FORBIDDEN — zona milik akun lain · HISTORY_LIMIT_EXCEEDED — rentang lebih tua dari riwayat paket (BR-007)" }
 *       404: { description: NOT_FOUND — zona tidak ada }
 *       409: { description: EXPORT_IN_PROGRESS — masih ada export aktif }
 *       422: { description: VALIDATION_ERROR atau EXPORT_LIMIT_EXCEEDED }
 *       502: { description: UPSTREAM_ERROR — R2 belum dikonfigurasi atau antrian tidak tersedia }
 */
router.post('/zones/:id/exports', exportController.create)

/**
 * @swagger
 * /zones/{id}/exports:
 *   get:
 *     summary: Riwayat export sebuah zona, terbaru dulu (maks 20)
 *     tags: [Exports]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Daftar export
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Export' }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN }
 *       404: { description: NOT_FOUND }
 */
router.get('/zones/:id/exports', exportController.listForZone)

/**
 * @swagger
 * /exports:
 *   get:
 *     summary: Export terbaru akun ini, lintas semua zona (dashboard)
 *     description: >
 *       Kartu "Recent exports" di dashboard. Bentuk tiap item sama dengan riwayat per
 *       zona, termasuk `downloadUrl` (signed, pendek) bila sudah selesai.
 *     tags: [Exports]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5, maximum: 20 }
 *     responses:
 *       200:
 *         description: Export terbaru, terbaru dulu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Export' }
 *       401: { description: UNAUTHORIZED }
 *       422: { description: VALIDATION_ERROR — limit di luar 1–20 }
 */
router.get('/exports', exportController.recent)

/**
 * @swagger
 * /exports/{id}:
 *   get:
 *     summary: Satu export — di-poll selama render berjalan
 *     tags: [Exports]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Export
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Export' }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN }
 *       404: { description: NOT_FOUND }
 *   delete:
 *     summary: Batalkan export yang berjalan, atau hapus export selesai beserta file-nya
 *     tags: [Exports]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: "`cancelled: true` bila export masih berjalan dan dibatalkan"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     cancelled: { type: boolean }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN }
 *       404: { description: NOT_FOUND }
 */
router.get('/exports/:id', exportController.detail)
router.delete('/exports/:id', exportController.remove)

/**
 * @swagger
 * /exports/{id}/retry:
 *   post:
 *     summary: Ulangi export dengan pengaturan dan frame yang sama (sebagai export baru)
 *     description: >
 *       Baris baru, bukan mereset yang lama — riwayat tetap menyimpan kegagalannya.
 *       Aturan yang sama berlaku: satu export aktif per akun, dan batas frame paket.
 *     tags: [Exports]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       202:
 *         description: Export baru diantre
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Export' }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN }
 *       404: { description: NOT_FOUND }
 *       409: { description: EXPORT_IN_PROGRESS }
 *       422: { description: EXPORT_LIMIT_EXCEEDED }
 */
router.post('/exports/:id/retry', exportController.retry)

export default router
