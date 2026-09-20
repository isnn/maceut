import { Router } from 'express'
import * as scheduleController from '../controllers/schedule.controller'
import { authMiddleware, planCheck } from '../middlewares/auth.middleware'

const router = Router()

// Limits are enforced in the service layer (BR-007), which is handed the plan rather
// than asked to look it up.
router.use(['/schedules', '/schedules/:id'], authMiddleware, planCheck)

/**
 * @swagger
 * components:
 *   schemas:
 *     Schedule:
 *       type: object
 *       description: >
 *         Satu jendela pengumpulan. Disimpan sebagai jendela (jam mulai/selesai,
 *         interval, hari), BUKAN sebagai cron — `cron` di bawah diturunkan saat
 *         dibaca. Arah itu dipilih karena jendela → cron selalu bisa, sedangkan
 *         cron → jendela tidak (banyak ekspresi cron tidak punya bentuk jendela).
 *       properties:
 *         id: { type: string, format: uuid }
 *         zoneId: { type: string, format: uuid }
 *         label: { type: string, example: Jam sibuk pagi }
 *         start: { type: string, example: "07:00" }
 *         end: { type: string, example: "09:00" }
 *         interval: { type: string, enum: ['15min', hourly, daily] }
 *         days:
 *           type: array
 *           items: { type: integer, minimum: 0, maximum: 6 }
 *           description: 0 = Senin … 6 = Minggu
 *         active: { type: boolean }
 *         framesPerDay: { type: integer, example: 2 }
 *         cron: { type: string, example: "0 7-8 * * 1-5", description: Diturunkan, tidak disimpan }
 *         capturedFrames: { type: integer }
 *         createdAt: { type: string, format: date-time }
 */

/**
 * @swagger
 * /schedules:
 *   get:
 *     summary: Daftar jendela pengumpulan milik user ini (F-06)
 *     tags: [Schedules]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: zoneId
 *         schema: { type: string, format: uuid }
 *         description: Batasi ke satu zona
 *     responses:
 *       200:
 *         description: Daftar jendela, terbaru dulu. Yang sudah dihapus tidak ikut.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Schedule' } }
 *       401: { description: UNAUTHORIZED }
 */
router.get('/schedules', scheduleController.list)

/**
 * @swagger
 * /schedules/stats:
 *   get:
 *     summary: Ringkasan anggaran frame untuk header papan Jadwal
 *     tags: [Schedules]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Total frame/hari dan jumlah jendela aktif
 */
router.get('/schedules/stats', scheduleController.stats)

/**
 * @swagger
 * /schedules:
 *   post:
 *     summary: Buat jendela pengumpulan (F-05)
 *     description: >
 *       Menegakkan BR-005 (batas jendela AKTIF per paket — yang di-pause tidak
 *       dihitung), batas interval per paket, dan anggaran frame/hari BR-006. Anggaran
 *       diperiksa per hari terburuk, bukan rata-rata: jendela yang hanya jalan hari
 *       Minggu tidak membebani hari Senin.
 *     tags: [Schedules]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [zoneId, label, start, end, interval, days]
 *             properties:
 *               zoneId: { type: string, format: uuid }
 *               label: { type: string, maxLength: 120 }
 *               start: { type: string, example: "07:00" }
 *               end: { type: string, example: "09:00" }
 *               interval: { type: string, enum: ['15min', hourly, daily] }
 *               days: { type: array, items: { type: integer } }
 *     responses:
 *       201:
 *         description: Jendela dibuat
 *       403: { description: FORBIDDEN — interval di luar paket, atau peran Viewer }
 *       404: { description: NOT_FOUND — zona bukan milik Anda }
 *       422: { description: SCHEDULE_LIMIT_EXCEEDED (BR-005) atau anggaran frame terlampaui }
 */
router.post('/schedules', scheduleController.create)

/**
 * @swagger
 * /schedules/{id}:
 *   patch:
 *     summary: Ubah atau pause/resume jendela (F-06)
 *     description: >
 *       Zona TIDAK bisa diubah — jendela yang menunjuk zona lain adalah jendela lain,
 *       dan riwayat capture-nya berhenti cocok. Resume diperiksa ulang terhadap
 *       BR-005: melanjutkan jendela saat slot sudah penuh ditolak.
 *     tags: [Schedules]
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
 *             properties:
 *               label: { type: string }
 *               start: { type: string }
 *               end: { type: string }
 *               interval: { type: string, enum: ['15min', hourly, daily] }
 *               days: { type: array, items: { type: integer } }
 *               active: { type: boolean }
 *     responses:
 *       200: { description: Jendela diperbarui }
 *       403: { description: FORBIDDEN }
 *       404: { description: NOT_FOUND }
 *       422: { description: SCHEDULE_LIMIT_EXCEEDED atau VALIDATION_ERROR }
 */
router.patch('/schedules/:id', scheduleController.update)

/**
 * @swagger
 * /schedules/{id}:
 *   delete:
 *     summary: Hapus jendela (soft delete, F-06)
 *     description: >
 *       Status menjadi `deleted`, barisnya tetap ada. Riwayat capture menunjuk jendela
 *       yang menghasilkannya, jadi menghapus barisnya akan membuat riwayat itu yatim.
 *     tags: [Schedules]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Jendela dihapus }
 */
router.delete('/schedules/:id', scheduleController.remove)

export default router
