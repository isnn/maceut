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
 *       di dashboard Midtrans → Settings → Payment → Notification URL — dan juga sebagai
 *       Recurring Notification URL: notifikasi `event_name: subscription.charge` (auto-renew)
 *       tidak bertanda tangan, jadi subscription dibaca ulang lewat GET /v1/subscriptions/{id}
 *       dan tagihannya lewat Get Status sebelum apa pun berubah.
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
router.use(
  ['/payments/prices', '/payments/checkout', '/payments/pending', '/payments/history', '/payments/auto-renew', '/payments/:orderId'],
  authMiddleware,
)

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
 *                     maxAheadDays: { type: integer, example: 180, description: 'A renewal may not end later than this many days from now' }
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
 * /payments/auto-renew:
 *   post:
 *     summary: Nyalakan auto-renew (kartu, Midtrans Subscription) — FE-56 fase 5
 *     description: >
 *       404 bila MIDTRANS_AUTO_RENEW_ENABLED=false. Membuat pembayaran Snap khusus kartu
 *       dengan `save_card` untuk paket saat ini (perpanjang) atau paket lebih tinggi.
 *       Setelah pembayaran terkonfirmasi, server membuat Subscription bulanan dari kartu
 *       tersimpan, tagihan pertama 1 hari sebelum periode berakhir. Midtrans yang
 *       menjadwalkan; aplikasi tidak pernah menagih kartu sendiri.
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
 *       201: { description: Token Snap (sama seperti /payments/checkout) }
 *       401: { description: UNAUTHORIZED }
 *       404: { description: NOT_FOUND — auto-renew tidak diaktifkan di server }
 *       422: { description: VALIDATION_ERROR — sudah aktif, Free, atau paket lebih rendah }
 *   delete:
 *     summary: Matikan auto-renew (membatalkan Subscription di Midtrans)
 *     description: >
 *       Pembatalan di Midtrans dulu; bila gagal, error dikembalikan (502) supaya tidak ada
 *       yang mengira tagihan sudah berhenti. Ganti paket, turun paket, kedaluwarsa, dan
 *       hapus akun juga membatalkannya.
 *     tags: [Payments]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '{ autoRenew: false }' }
 *       401: { description: UNAUTHORIZED }
 *       404: { description: NOT_FOUND — auto-renew tidak diaktifkan di server }
 *       502: { description: PAYMENT_PROVIDER_ERROR — Midtrans gagal membatalkan }
 */
router.post('/payments/auto-renew', paymentController.enableAutoRenew)
router.delete('/payments/auto-renew', paymentController.disableAutoRenew)

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

/**
 * @swagger
 * /payments/{orderId}/change-method:
 *   post:
 *     summary: Ganti metode pembayaran untuk pembayaran yang masih terbuka
 *     description: >
 *       Order Snap terikat pada metode yang dipilih pertama kali. Bila belum ada metode
 *       dipilih, token yang sama dikembalikan (Snap tetap menampilkan semua metode). Bila
 *       sudah (VA, QRIS, e-wallet), order dibatalkan di Midtrans (POST /v2/{order_id}/cancel)
 *       lalu order baru untuk paket yang sama dibuat. Bila ternyata sudah final di Midtrans
 *       (dibayar, kedaluwarsa), status dicatat dan `checkout` null. Hanya pemilik.
 *     tags: [Payments]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: orderId, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: '{ payment, checkout } — checkout berisi token Snap yang dibuka, atau null'
 *       401: { description: UNAUTHORIZED }
 *       404: { description: NOT_FOUND — tidak ada, atau milik akun lain }
 *       422: { description: VALIDATION_ERROR — pembayaran sudah tidak terbuka }
 *       502: { description: PAYMENT_PROVIDER_ERROR — Midtrans gagal membatalkan }
 *       503: { description: PAYMENTS_NOT_CONFIGURED }
 */
router.post('/payments/:orderId/change-method', paymentController.changeMethod)

/**
 * @swagger
 * /payments/{orderId}/invoice:
 *   get:
 *     summary: Unduh invoice PDF untuk pembayaran yang sudah dibayar
 *     description: >
 *       Dibuat dari baris `payments` dan akun (nomor invoice = order id), dirender ke PDF
 *       dengan Chromium yang sudah ada di image. Hanya pemilik; hanya status paid atau refunded.
 *     tags: [Payments]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: orderId, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: File PDF (attachment)
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       401: { description: UNAUTHORIZED }
 *       404: { description: NOT_FOUND — tidak ada, atau milik akun lain }
 *       422: { description: VALIDATION_ERROR — pembayaran belum terkonfirmasi }
 */
router.get('/payments/:orderId/invoice', paymentController.invoice)

export default router
