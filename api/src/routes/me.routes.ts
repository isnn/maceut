import { Router } from 'express'
import * as meController from '../controllers/me.controller'
import * as usageController from '../controllers/usage.controller'
import { authMiddleware } from '../middlewares/auth.middleware'

const router = Router()

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         email: { type: string, format: email }
 *         fullName: { type: string, example: Budi Santoso }
 *         plan: { type: string, enum: [free, standard, premium] }
 *         role: { type: string, enum: [user, internal], description: Platform role, ditentukan INTERNAL_EMAILS (BR-027) }
 *         onboardingDone: { type: boolean }
 *         createdAt: { type: string, format: date-time }
 */

/**
 * @swagger
 * /me:
 *   get:
 *     summary: User yang sedang login, dalam bentuk aplikasi
 *     description: >
 *       Sign up, login dan logout ditangani Better Auth di `/api/auth/*` dengan format
 *       respons miliknya sendiri (ADR-009). Endpoint ini melengkapi: mengembalikan
 *       paket, platform role yang sudah di-resolve dari konfigurasi, dan status
 *       onboarding — hal-hal yang tidak diketahui Better Auth.
 *     tags: [Account]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Data user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: UNAUTHORIZED — tidak ada sesi aktif
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/me', authMiddleware, meController.me)

/**
 * @swagger
 * /me/onboarding:
 *   post:
 *     summary: Tandai onboarding selesai
 *     description: >
 *       Tidak menerima body. Setiap akun mulai di paket Free; paket berbayar diberikan
 *       staf lewat PATCH /internal/users/{id}/plan. Sebelumnya endpoint ini menerima
 *       `plan`, yang berarti akun baru bisa memberi dirinya sendiri batas Premium
 *       tanpa membayar apa pun.
 *     tags: [Account]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Onboarding ditandai selesai
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401: { description: UNAUTHORIZED }
 */
router.post('/me/onboarding', authMiddleware, meController.completeOnboarding)

/**
 * @swagger
 * /me/plan:
 *   patch:
 *     summary: Turunkan paket sendiri (upgrade ditolak sampai ada billing)
 *     description: >
 *       Hanya menurunkan paket. Upgrade ditolak dengan 403 UPGRADE_NOT_SELF_SERVE
 *       karena menambah kapasitas yang belum dibayar siapa pun — paket berbayar
 *       diberikan staf lewat PATCH /internal/users/{id}/plan, sehingga ada catatan
 *       siapa memberi apa. Menurunkan paket tetap self-serve: melepas kapasitas tidak
 *       merugikan bisnis, dan memaksa orang membuka tiket untuk berhemat itu tidak
 *       masuk akal. Penurunan menjalankan grandfather-and-block penuh (ADR-020) —
 *       tidak ada yang dihapus, yang melebihi batas di-pause.
 *     tags: [Account]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan]
 *             properties:
 *               plan: { type: string, enum: [free, standard, premium] }
 *     responses:
 *       200:
 *         description: Paket diubah
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: UPGRADE_NOT_SELF_SERVE — naik paket harus lewat staf }
 *       422: { description: VALIDATION_ERROR — paket tidak dikenal }
 */
router.patch('/me/plan', authMiddleware, meController.changeOwnPlan)

/**
 * @swagger
 * /plan/impact:
 *   get:
 *     summary: Apa yang akan di-pause kalau pindah ke paket tertentu (ADR-020)
 *     description: >
 *       Tidak mengubah apa pun. Menjalankan fungsi yang sama dengan perubahan paket
 *       sungguhan, supaya yang diperingatkan ke user dan yang benar-benar terjadi
 *       tidak bisa berbeda. Aturannya grandfather-and-block: tidak ada yang dihapus,
 *       yang melebihi batas di-pause, dan pembuatan baru ditolak sampai kembali di
 *       bawah batas.
 *     tags: [Account]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: plan
 *         required: true
 *         schema: { type: string, enum: [free, standard, premium] }
 *     responses:
 *       200:
 *         description: Daftar zona & jendela yang akan di-pause, dengan alasannya
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { type: string }
 *                     clean: { type: boolean, description: true = tidak ada yang berubah }
 *                     zonesToPause: { type: array, items: { type: object } }
 *                     schedulesToPause: { type: array, items: { type: object } }
 *       401: { description: UNAUTHORIZED }
 */
router.get('/plan/impact', authMiddleware, meController.planImpact)

/**
 * @swagger
 * /usage:
 *   get:
 *     summary: Ringkasan dashboard (F-19)
 *     description: >
 *       Setiap angka di sini diukur atau `null` — tidak ada yang diperkirakan. Angka
 *       yang kelihatan masuk akal tapi sebenarnya dikarang lebih buruk daripada tanda
 *       "—", karena tidak ada yang terpikir untuk memeriksanya. `null` saat ini berarti
 *       tabel captures belum ada (CAP-01) atau HERE belum menjawab.
 *       `pausedByPlan` menunjukkan berapa zona/jendela yang di-pause karena melebihi
 *       batas paket (ADR-020) — tanpa itu, akun yang baru turun paket hanya melihat
 *       pengumpulan berhenti tanpa penjelasan.
 *     tags: [Account]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Ringkasan pemakaian + kesehatan koleksi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { type: string, enum: [free, standard, premium] }
 *                     zonesCount: { type: integer }
 *                     zonesLimit: { type: integer }
 *                     schedulesActiveCount: { type: integer }
 *                     schedulesLimit: { type: integer }
 *                     framesPerDay: { type: integer, description: Hari tersibuk, bukan jumlah seminggu }
 *                     capturesToday: { type: integer, nullable: true }
 *                     rendersThisMonth: { type: integer, nullable: true }
 *                     storageUsedGb: { type: number, nullable: true }
 *                     pausedByPlan:
 *                       type: object
 *                       properties:
 *                         zones: { type: integer }
 *                         schedules: { type: integer }
 *                     health:
 *                       type: object
 *                       properties:
 *                         status: { type: string, enum: [healthy, degraded, idle] }
 *                         nextCaptureAt: { type: string, nullable: true, example: "07:00" }
 *                         roadsReporting: { type: integer, nullable: true }
 *       401: { description: UNAUTHORIZED }
 */
router.get('/usage', authMiddleware, usageController.usage)

export default router
