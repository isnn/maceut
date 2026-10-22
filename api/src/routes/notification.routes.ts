import { Router } from 'express'
import * as notificationController from '../controllers/notification.controller'
import { authMiddleware } from '../middlewares/auth.middleware'

const router = Router()

// Customers and staff alike — staff get HERE budget alerts in the same bell. Every path
// is listed: a route must never rely on another file's guard.
router.use(
  ['/notifications', '/notifications/read-all', '/notifications/:id/read', '/me/notification-preferences'],
  authMiddleware,
)

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Notifikasi terbaru untuk bell + jumlah belum dibaca (NOTIF)
 *     description: >
 *       Diisi oleh kejadian di sistem — capture terjadwal mulai gagal / pulih, capture
 *       terlewat karena sistem mati, batas harian 80% / tercapai, export selesai / gagal,
 *       paket berubah, dan (staf) anggaran HERE 80% / tercapai. Dibaca ulang tiap 60 detik
 *       dan saat tab kembali aktif.
 *     tags: [Notifications]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Notifikasi terbaru, terbaru dulu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     unreadCount: { type: integer, example: 2 }
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, format: uuid }
 *                           type: { type: string, example: capture_failing }
 *                           tone: { type: string, enum: [warning, success, info] }
 *                           title: { type: string }
 *                           body: { type: string }
 *                           actionLabel: { type: string, nullable: true }
 *                           actionHref: { type: string, nullable: true, example: '/zones/3f8a…' }
 *                           zoneName: { type: string, nullable: true, description: Zona yang dibicarakan — untuk mengelompokkan di bell }
 *                           read: { type: boolean }
 *                           createdAt: { type: string, format: date-time }
 *       401: { description: UNAUTHORIZED }
 */
router.get('/notifications', notificationController.list)

/**
 * @swagger
 * /notifications/read-all:
 *   post:
 *     summary: Tandai semua notifikasi sudah dibaca
 *     tags: [Notifications]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: "`{ marked }` — berapa yang baru ditandai" }
 *       401: { description: UNAUTHORIZED }
 */
router.post('/notifications/read-all', notificationController.readAll)

/**
 * @swagger
 * /notifications/{id}/read:
 *   post:
 *     summary: Tandai satu notifikasi sudah dibaca
 *     description: >
 *       Dipanggil saat notifikasi diklik. Notifikasi "capture gagal" yang sudah dibaca di
 *       aplikasi tidak lagi dikirim lewat email.
 *     tags: [Notifications]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Ditandai }
 *       401: { description: UNAUTHORIZED }
 *       404: { description: NOT_FOUND — tidak ada, atau milik akun lain }
 */
router.post('/notifications/:id/read', notificationController.read)

/**
 * @swagger
 * /me/notification-preferences:
 *   get:
 *     summary: Pilihan email notifikasi akun ini
 *     description: >
 *       Satu pilihan saja — email bila capture terus gagal (maks. 1 per hari, setelah 2
 *       jam). Notifikasi lain hanya di aplikasi. Kode verifikasi/reset dan pemberitahuan
 *       perubahan paket oleh staf selalu dikirim.
 *     tags: [Notifications]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Pilihan saat ini (default bila belum pernah diatur)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     emailCaptureProblems: { type: boolean, example: true }
 *       401: { description: UNAUTHORIZED }
 *   patch:
 *     summary: Ubah pilihan email notifikasi
 *     tags: [Notifications]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emailCaptureProblems]
 *             properties:
 *               emailCaptureProblems: { type: boolean }
 *     responses:
 *       200: { description: Pilihan tersimpan }
 *       401: { description: UNAUTHORIZED }
 *       422: { description: VALIDATION_ERROR }
 */
router.get('/me/notification-preferences', notificationController.getPreferences)
router.patch('/me/notification-preferences', notificationController.updatePreferences)

export default router
