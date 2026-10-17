import { Router } from 'express'
import * as paymentController from '../controllers/payment.controller'
import { authMiddleware } from '../middlewares/auth.middleware'

const router = Router()

/**
 * @swagger
 * /payments/midtrans/notification:
 *   post:
 *     summary: HTTP notification dari Midtrans (webhook)
 *     description: >
 *       Tanpa sesi. Diautentikasi oleh `signature_key` = SHA512(order_id + status_code +
 *       gross_amount + server key). Status lalu dibaca ulang lewat Get Status API dan
 *       hanya jawaban itu yang mengubah baris. Idempoten: notifikasi ganda atau
 *       `expire` yang telat tidak mengubah pembayaran yang sudah final. Pasang URL ini
 *       di dashboard Midtrans → Settings → Payment → Notification URL.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               order_id: { type: string }
 *               status_code: { type: string, example: '200' }
 *               gross_amount: { type: string, example: '99000.00' }
 *               transaction_status: { type: string, example: settlement }
 *               signature_key: { type: string }
 *     responses:
 *       200: { description: 'Diterima: applied | unchanged | unknown_order | no_transaction' }
 *       403: { description: FORBIDDEN — signature salah atau merchant lain }
 *       500: { description: Gagal menyimpan — Midtrans akan mengirim ulang }
 *       503: { description: PAYMENTS_NOT_CONFIGURED }
 */
router.post('/payments/midtrans/notification', paymentController.notification)

// Registered above the guard on purpose: the Midtrans notification has no session and
// is authenticated by its signature. Every other payment path needs a signed-in
// account, and each is listed — '/payments/:orderId' as a mount path would also match
// '/payments/midtrans/…' if the notification route came after it.
router.use(['/payments/prices', '/payments/checkout', '/payments/pending', '/payments/history', '/payments/:orderId'], authMiddleware)

/**
 * @swagger
 * /payments/prices:
 *   get:
 *     summary: Harga paket dan apakah pembayaran aktif (FE-56)
 *     description: >
 *       `enabled` false bila MIDTRANS_SERVER_KEY belum di-set — halaman profil tetap
 *       "Contact us to upgrade". Harga dalam rupiah, sama dengan yang ditagihkan.
 *     tags: [Payments]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Harga per paket
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean }
 *                     periodDays: { type: integer, example: 30 }
 *                     prices:
 *                       type: object
 *                       properties:
 *                         free: { type: integer, example: 0 }
 *                         starter: { type: integer, example: 99000 }
 *                         standard: { type: integer, example: 349000 }
 *                         premium: { type: integer, example: 1490000 }
 *       401: { description: UNAUTHORIZED }
 */
router.get('/payments/prices', paymentController.prices)

/**
 * @swagger
 * /payments/checkout:
 *   post:
 *     summary: Mulai pembayaran paket lewat Midtrans Snap (FE-56)
 *     description: >
 *       Upgrade atau perpanjang paket yang sama (30 hari). Jumlah diambil dari tabel
 *       harga server, bukan dari request. Baris `payments` ditulis `creating` SEBELUM
 *       Snap dipanggil, lalu `pending` dengan token. Pembayaran pending untuk paket yang
 *       sama dipakai ulang (`reused: true`). Paket aktif hanya setelah notifikasi
 *       Midtrans terverifikasi atau cek status server — bukan dari callback browser.
 *     tags: [Payments]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan]
 *             properties:
 *               plan: { type: string, enum: [starter, standard, premium] }
 *     responses:
 *       201:
 *         description: Token Snap untuk `window.snap.pay(token)`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId: { type: string, example: 'MCT-abc12345-1792200000000' }
 *                     token: { type: string }
 *                     redirectUrl: { type: string }
 *                     amount: { type: integer, example: 99000 }
 *                     plan: { type: string }
 *                     reused: { type: boolean }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN — akun staf tidak punya paket pelanggan }
 *       422: { description: VALIDATION_ERROR — Free, paket lebih rendah, atau perpanjang paket tanpa tanggal akhir }
 *       502: { description: PAYMENT_PROVIDER_ERROR — Midtrans menolak / tidak terjangkau }
 *       503: { description: PAYMENTS_NOT_CONFIGURED }
 */
router.post('/payments/checkout', paymentController.checkout)

/**
 * @swagger
 * /payments/pending:
 *   get:
 *     summary: Pembayaran yang masih terbuka (tombol "Continue payment")
 *     tags: [Payments]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Pembayaran pending terbaru dalam jendela 24 jam, atau null
 *       401: { description: UNAUTHORIZED }
 */
router.get('/payments/pending', paymentController.pending)

/**
 * @swagger
 * /payments/history:
 *   get:
 *     summary: Riwayat pembayaran akun (tab Billing)
 *     tags: [Payments]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Pembayaran terbaru dulu (maks. 50): orderId, plan, amount, status, paymentType, paidAt, periodEnd, createdAt'
 *       401: { description: UNAUTHORIZED }
 */
router.get('/payments/history', paymentController.history)

/**
 * @swagger
 * /payments/{orderId}:
 *   get:
 *     summary: Status satu pembayaran, dicek ulang ke Midtrans
 *     description: >
 *       Dipanggil sekali oleh browser saat popup Snap melapor sukses, dan saat kembali
 *       lewat finish redirect. Bila masih terbuka, server memanggil Get Status API dan
 *       bisa mengaktifkan paket sebelum notifikasi tiba. Hanya pemilik pembayaran.
 *     tags: [Payments]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: orderId, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: 'Status: creating | pending | paid | failed | expired | cancelled | refunded'
 *       401: { description: UNAUTHORIZED }
 *       404: { description: NOT_FOUND — tidak ada, atau milik akun lain }
 */
router.get('/payments/:orderId', paymentController.show)

export default router
