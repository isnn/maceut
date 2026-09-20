import { Router } from 'express'
import * as meController from '../controllers/me.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { workspaceContext } from '../middlewares/workspace.middleware'

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
 *         organisation: { type: string, nullable: true, example: Dinas Perhubungan DIY }
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
router.get('/me', authMiddleware, workspaceContext, meController.me)

/**
 * @swagger
 * /me/onboarding:
 *   post:
 *     summary: Selesaikan onboarding dengan memilih paket
 *     description: Langkah 2 alur daftar. Menyetel plan dan menandai onboardingDone.
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
 *         description: Paket tersimpan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401: { description: UNAUTHORIZED }
 *       422: { description: VALIDATION_ERROR — paket tidak dikenal }
 */
router.post('/me/onboarding', authMiddleware, meController.completeOnboarding)

/**
 * @swagger
 * /me/plan:
 *   patch:
 *     summary: Ganti paket sendiri (SEMENTARA — belum ada gate pembayaran)
 *     description: >
 *       ⚠️ Placeholder sampai billing dikerjakan (Sprint 3). Endpoint ini TIDAK
 *       memverifikasi pembayaran, jadi akun mana pun bisa memberi dirinya batas
 *       premium secara gratis. Dipakai oleh tombol ganti paket di halaman Profil,
 *       yang memang tercatat sebagai simulasi. Saat billing ada, endpoint ini wajib
 *       diubah menjadi: buat payment intent, dan paket hanya berpindah setelah
 *       webhook pembayaran terkonfirmasi.
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
 *       422: { description: VALIDATION_ERROR — paket tidak dikenal }
 */
router.patch('/me/plan', authMiddleware, meController.changeOwnPlan)

export default router
